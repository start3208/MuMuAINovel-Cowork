import { Route, Routes, Navigate } from 'react-router-dom';
import WorkspaceHomePage from './pages/WorkspaceHomePage';
import WorkspaceProjectShell from './pages/WorkspaceProjectShell';
import WorkspaceOverviewPage from './pages/WorkspaceOverviewPage';
import WorkspaceWorldSettingPage from './pages/WorkspaceWorldSettingPage';
import WorkspaceCharactersPage from './pages/WorkspaceCharactersPage';
import WorkspaceOutlinePage from './pages/WorkspaceOutlinePage';
import WorkspaceChaptersPage from './pages/WorkspaceChaptersPage';
import WorkspaceForeshadowsPage from './pages/WorkspaceForeshadowsPage';
import WorkspaceRelationshipGraphPage from './pages/WorkspaceRelationshipGraphPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkspaceHomePage />} />
      <Route path="/workspace/:workspaceName" element={<WorkspaceProjectShell />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<WorkspaceOverviewPage />} />
        <Route path="world-setting" element={<WorkspaceWorldSettingPage />} />
        <Route path="characters" element={<WorkspaceCharactersPage />} />
        <Route path="outline" element={<WorkspaceOutlinePage />} />
        <Route path="chapters" element={<WorkspaceChaptersPage />} />
        <Route path="foreshadows" element={<WorkspaceForeshadowsPage />} />
        <Route path="relationships-graph" element={<WorkspaceRelationshipGraphPage />} />
      </Route>
    </Routes>
  );
}
