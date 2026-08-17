import os
import uuid

import pandas as pd
import requests
import streamlit as st

API_BASE = os.environ.get("SAFESQL_API_BASE", "http://localhost:8000")

st.set_page_config(page_title="SafeSQL", page_icon="🛡️", layout="wide")

if "session_id" not in st.session_state:
    st.session_state.session_id = str(uuid.uuid4())
if "last_response" not in st.session_state:
    st.session_state.last_response = None
if "pending_clarification" not in st.session_state:
    st.session_state.pending_clarification = None

st.title("🛡️ SafeSQL")
st.caption("Natural language to SQL, with guardrails and hallucination detection.")

with st.sidebar:
    st.subheader("Session history")
    try:
        hist = requests.get(f"{API_BASE}/v1/history", params={"session_id": st.session_state.session_id}, timeout=10).json()
    except Exception as e:
        hist = []
        st.error(f"Could not reach API at {API_BASE}: {e}")
    for item in hist:
        conf = item.get("confidence_overall")
        conf_str = f"{conf:.0%}" if conf is not None else "—"
        st.markdown(f"**{item['question']}**  \n`{item['status']}` · confidence {conf_str}")
        st.divider()

question = st.text_input("Ask a question about the data", placeholder="e.g. What are the top 5 best-selling products by quantity?")
col_a, col_b = st.columns([1, 5])
ask = col_a.button("Ask", type="primary")

def call_query(payload):
    r = requests.post(f"{API_BASE}/v1/query", json=payload, timeout=60)
    r.raise_for_status()
    return r.json()

if ask and question.strip():
    with st.spinner("Generating SQL..."):
        try:
            resp = call_query({"question": question, "session_id": st.session_state.session_id})
        except Exception as e:
            st.error(f"Request failed: {e}")
            resp = None
    st.session_state.last_response = resp
    st.session_state.pending_clarification = resp if resp and resp.get("status") == "needs_clarification" else None

resp = st.session_state.last_response

if resp:
    if resp["status"] == "needs_clarification":
        clarif = resp["clarification"]
        st.warning(f"Your question uses the ambiguous term **'{clarif['ambiguous_term']}'**. Pick an interpretation:")
        for interp in clarif["interpretations"]:
            with st.expander(f"{interp['label']} — {interp['description']}"):
                st.code(interp["example_sql"], language="sql")
                if st.button(f"Use '{interp['label']}'", key=f"pick_{interp['label']}"):
                    with st.spinner("Generating SQL..."):
                        resp2 = call_query({
                            "question": resp["question"],
                            "session_id": st.session_state.session_id,
                            "force_interpretation": interp["label"],
                        })
                    st.session_state.last_response = resp2
                    st.rerun()

    elif resp["status"] == "blocked":
        st.error("🚫 Blocked by guardrails")
        st.code(resp.get("sql") or "", language="sql")
        for w in resp["guardrail_warnings"]:
            st.markdown(f"- **{w['rule']}**: {w['reason']}")

    elif resp["status"] == "error":
        st.error(f"Execution error: {resp.get('error')}")
        if resp.get("sql"):
            st.code(resp["sql"], language="sql")

    elif resp["status"] == "ok":
        conf = resp["confidence"]
        overall = conf["overall"] if conf else 0

        left, right = st.columns([3, 1])
        with left:
            st.subheader("Generated SQL")
            st.code(resp["sql"], language="sql")
            st.caption(resp.get("explanation", ""))
            editable = st.text_area("Edit and inspect (not re-executed automatically)", value=resp["sql"], height=100)

        with right:
            st.metric("Confidence", f"{overall:.0%}")
            color = "🟢" if overall >= 0.75 else ("🟡" if overall >= 0.5 else "🔴")
            st.markdown(f"{color} overall")
            if conf:
                st.progress(conf["back_translation_alignment"], text=f"Back-translation alignment {conf['back_translation_alignment']:.0%}")
                st.progress(conf["sanity_check_pass_rate"], text=f"Sanity checks {conf['sanity_check_pass_rate']:.0%}")
                st.progress(conf["schema_coverage_score"], text=f"Schema coverage {conf['schema_coverage_score']:.0%}")
                if conf["multi_query_agreement"] is not None:
                    st.progress(conf["multi_query_agreement"], text=f"Multi-query agreement {conf['multi_query_agreement']:.0%}")

        if resp.get("guardrail_warnings"):
            with st.expander("⚠️ Guardrail warnings"):
                for w in resp["guardrail_warnings"]:
                    st.markdown(f"- **{w['rule']}**: {w['reason']}")

        if resp.get("sanity_flags"):
            with st.expander("🔎 Sanity check flags"):
                for f in resp["sanity_flags"]:
                    st.markdown(f"- **{f['check']}**: {f['message']}")

        if resp.get("alternate_sql"):
            with st.expander(f"Cross-check query ({'✅ agrees' if resp['alternate_agreement'] else '❌ disagrees'})"):
                st.code(resp["alternate_sql"], language="sql")

        st.subheader(f"Results ({resp['row_count']} rows{', truncated' if resp['truncated'] else ''})")
        if resp["rows"]:
            df = pd.DataFrame(resp["rows"], columns=resp["columns"])
            st.dataframe(df, use_container_width=True)
        else:
            st.info("Query returned no rows.")

        st.caption(f"Executed in {resp.get('execution_time_ms', 0):.1f} ms · query_id `{resp['query_id']}`")

        fb1, fb2, _ = st.columns([1, 1, 6])
        if fb1.button("👍 Correct"):
            requests.post(f"{API_BASE}/v1/feedback", json={"query_id": resp["query_id"], "correct": True})
            st.toast("Thanks — recorded as correct.")
        if fb2.button("👎 Incorrect"):
            requests.post(f"{API_BASE}/v1/feedback", json={"query_id": resp["query_id"], "correct": False})
            st.toast("Thanks — recorded as incorrect, will feed the eval suite.")

with st.expander("📋 Database schema"):
    try:
        schema = requests.get(f"{API_BASE}/v1/schema", timeout=10).json()
        for table, info in schema.items():
            st.markdown(f"**{table}** — {info['description']}")
            st.dataframe(pd.DataFrame(info["columns"]), use_container_width=True, hide_index=True)
    except Exception as e:
        st.error(f"Could not load schema: {e}")
