import { Route, Routes } from "react-router-dom";
import NavBar from "./components/layout/NavBar";
import Footer from "./components/layout/Footer";
import Landing from "./pages/Landing";
import Workspace from "./pages/Workspace";
import SchemaExplorer from "./pages/SchemaExplorer";
import History from "./pages/History";
import SafetyDashboard from "./pages/SafetyDashboard";

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/workspace" element={<Workspace />} />
          <Route path="/schema" element={<SchemaExplorer />} />
          <Route path="/history" element={<History />} />
          <Route path="/safety" element={<SafetyDashboard />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
