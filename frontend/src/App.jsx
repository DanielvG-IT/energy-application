import {
  BrowserRouter as Router,
  Routes,
  Route,
  Outlet,
} from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Solar from "./pages/Solar";
import Gas from "./pages/Gas";
import Settings from "./pages/Settings";
import "./styles.css";

function LayoutWrapper() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<LayoutWrapper />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          <Route path="/solar" element={<Solar />} />
          <Route path="/gas" element={<Gas />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  );
}
