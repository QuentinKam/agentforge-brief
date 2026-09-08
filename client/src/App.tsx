// 路由配置 — Login/Register 公开；Projects/Playground/Runs 需登录
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { getToken } from './lib/api';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { ProjectsPage } from './pages/Projects';
import { PlaygroundPage } from './pages/Playground';
import { RunHistoryPage } from './pages/RunHistory';
import { HarnessBuilderPage } from './pages/HarnessBuilder';
import { SkillsPage } from './pages/Skills';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (!getToken()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<LoginPage />} />
        <Route
          path="/projects"
          element={
            <RequireAuth>
              <Layout>
                <ProjectsPage />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/playground/:id"
          element={
            <RequireAuth>
              <Layout>
                <PlaygroundPage />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/harness/:id"
          element={
            <RequireAuth>
              <Layout>
                <HarnessBuilderPage />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/skills/:id"
          element={
            <RequireAuth>
              <Layout>
                <SkillsPage />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/runs"
          element={
            <RequireAuth>
              <Layout>
                <RunHistoryPage />
              </Layout>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
