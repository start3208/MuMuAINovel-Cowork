import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { App, Button, Layout, Menu, Spin, Typography, theme } from 'antd';
import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  BookOutlined,
  FileTextOutlined,
  FundOutlined,
  GlobalOutlined,
  TeamOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { studioApi } from '../api';
import type { ProjectExportData, WorkspaceSummary } from '../types';
import { WorkspaceContext } from '../workspace-context';
import { projectStats } from '../workspace-utils';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export default function WorkspaceProjectShell() {
  const { message } = App.useApp();
  const { workspaceName } = useParams<{ workspaceName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [data, setData] = useState<ProjectExportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!workspaceName) {
      return;
    }
    setLoading(true);
    try {
      const [workspaceSummary, workspaceData] = await Promise.all([
        studioApi.getWorkspaceSummary(workspaceName),
        studioApi.getWorkspaceData(workspaceName),
      ]);
      setSummary(workspaceSummary);
      setData(workspaceData);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载工作区失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [workspaceName]);

  const saveData = async (nextData: ProjectExportData) => {
    if (!workspaceName) {
      return;
    }
    setSaving(true);
    try {
      const nextSummary = await studioApi.saveWorkspaceData(workspaceName, nextData);
      setData(nextData);
      setSummary(nextSummary);
      message.success('已保存到本地工作区');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const menuItems = [
    {
      key: 'overview',
      icon: <FundOutlined />,
      label: <Link to={`/workspace/${workspaceName}/overview`}>工作区概览</Link>,
    },
    {
      key: 'world-setting',
      icon: <GlobalOutlined />,
      label: <Link to={`/workspace/${workspaceName}/world-setting`}>世界设定</Link>,
    },
    {
      key: 'characters',
      icon: <TeamOutlined />,
      label: <Link to={`/workspace/${workspaceName}/characters`}>角色管理</Link>,
    },
    {
      key: 'outline',
      icon: <FileTextOutlined />,
      label: <Link to={`/workspace/${workspaceName}/outline`}>大纲管理</Link>,
    },
    {
      key: 'chapters',
      icon: <BookOutlined />,
      label: <Link to={`/workspace/${workspaceName}/chapters`}>章节管理</Link>,
    },
    {
      key: 'foreshadows',
      icon: <BulbOutlined />,
      label: <Link to={`/workspace/${workspaceName}/foreshadows`}>伏笔管理</Link>,
    },
    {
      key: 'relationships-graph',
      icon: <ApartmentOutlined />,
      label: <Link to={`/workspace/${workspaceName}/relationships-graph`}>关系图谱</Link>,
    },
  ];

  const selectedKey = useMemo(() => {
    const path = location.pathname;
    const item = menuItems.find((entry) => path.includes(entry.key));
    return item?.key ?? 'overview';
  }, [location.pathname]);

  if (loading || !summary || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const currentWorkspaceName = workspaceName || summary.name;
  const stats = projectStats(data);

  return (
    <WorkspaceContext.Provider
      value={{
        workspaceName: currentWorkspaceName,
        summary,
        data,
        reload: load,
        saveData,
      }}
    >
      <Layout className="studio-page">
        <Sider
          width={220}
          style={{
            background: token.colorBgContainer,
            borderRight: `1px solid ${token.colorBorderSecondary}`,
            boxShadow: '4px 0 18px rgba(17, 24, 39, 0.08)',
          }}
        >
          <div
            style={{
              height: 72,
              background: token.colorPrimary,
              color: token.colorWhite,
              display: 'flex',
              alignItems: 'center',
              padding: '0 18px',
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            Workspace Studio
          </div>
          <Menu mode="inline" selectedKeys={[selectedKey]} items={menuItems} style={{ borderRight: 0, paddingTop: 12 }} />
        </Sider>

        <Layout>
          <Header
            style={{
              background: token.colorPrimary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 24px',
              boxShadow: '0 8px 20px rgba(17, 24, 39, 0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} />
              <div>
                <div style={{ color: token.colorWhite, fontSize: 22, fontWeight: 700 }}>
                  {data.project.title || summary.project_title || currentWorkspaceName}
                </div>
                <Text style={{ color: 'rgba(255,255,255,0.8)' }}>本地工作区：{currentWorkspaceName}</Text>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14 }}>
              {stats.map((item) => (
                <div
                  key={item.label}
                  style={{
                    minWidth: 68,
                    height: 56,
                    padding: '8px 14px',
                    borderRadius: 28,
                    background: 'rgba(255,255,255,0.14)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.82)', fontSize: 11 }}>{item.label}</span>
                  <span style={{ color: token.colorWhite, fontWeight: 700 }}>
                    {item.value}
                    <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.8 }}>{item.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          </Header>

          <Content style={{ padding: 24 }}>
            <div
              style={{
                background: token.colorBgContainer,
                minHeight: 'calc(100vh - 120px)',
                borderRadius: 18,
                boxShadow: '0 18px 48px rgba(17, 24, 39, 0.08)',
                padding: 24,
                overflow: 'hidden',
              }}
            >
              <Outlet context={{ loading, saving }} />
            </div>
          </Content>
        </Layout>
      </Layout>
    </WorkspaceContext.Provider>
  );
}
