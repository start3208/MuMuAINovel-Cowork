import { Route, Routes, Navigate } from 'react-router-dom';
import WorkspaceHomePage from './pages/WorkspaceHomePage';
import WorkspaceProjectShell from './pages/WorkspaceProjectShell';
import WorkspaceOverviewPage from './pages/WorkspaceOverviewPage';
import WorkspaceWorldSettingPage from './pages/WorkspaceWorldSettingPage';
import WorkspaceCharactersPage from './pages/WorkspaceCharactersPage';
import WorkspaceCareersPage from './pages/WorkspaceCareersPage';
import WorkspaceOrganizationsPage from './pages/WorkspaceOrganizationsPage';
import WorkspaceRelationshipsPage from './pages/WorkspaceRelationshipsPage';
import WorkspaceOutlinePage from './pages/WorkspaceOutlinePage';
import WorkspaceChaptersPage from './pages/WorkspaceChaptersPage';
import WorkspaceChapterAnalysisPage from './pages/WorkspaceChapterAnalysisPage';
import WorkspaceForeshadowsPage from './pages/WorkspaceForeshadowsPage';
import WorkspaceWritingStylesPage from './pages/WorkspaceWritingStylesPage';
import WorkspaceRelationshipGraphPage from './pages/WorkspaceRelationshipGraphPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkspaceHomePage />} />
      <Route path="/workspace/:workspaceName" element={<WorkspaceProjectShell />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<WorkspaceOverviewPage />} />
        <Route path="world-setting" element={<WorkspaceWorldSettingPage />} />
        <Route path="careers" element={<WorkspaceCareersPage />} />
        <Route path="characters" element={<WorkspaceCharactersPage />} />
        <Route path="organizations" element={<WorkspaceOrganizationsPage />} />
        <Route path="relationships" element={<WorkspaceRelationshipsPage />} />
        <Route path="outline" element={<WorkspaceOutlinePage />} />
        <Route path="chapters" element={<WorkspaceChaptersPage />} />
        <Route path="chapter-analysis" element={<WorkspaceChapterAnalysisPage />} />
        <Route path="foreshadows" element={<WorkspaceForeshadowsPage />} />
        <Route path="writing-styles" element={<WorkspaceWritingStylesPage />} />
        <Route path="relationships-graph" element={<WorkspaceRelationshipGraphPage />} />
      </Route>
    </Routes>
  );
}
