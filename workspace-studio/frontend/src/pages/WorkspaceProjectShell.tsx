import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { App, Button, Drawer, Layout, Menu, Spin, theme } from 'antd';
import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  BankOutlined,
  BookOutlined,
  BulbOutlined,
  EditOutlined,
  FileTextOutlined,
  FundOutlined,
  GlobalOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { studioApi } from '../api';
import type { ProjectExportData, WorkspaceSummary } from '../types';
import { WorkspaceContext } from '../workspace-context';
import { projectStats } from '../workspace-utils';

const { Header, Sider, Content } = Layout;

const isMobile = () => window.innerWidth <= 768;

export default function WorkspaceProjectShell() {
  const { message } = App.useApp();
  const { workspaceName } = useParams<{ workspaceName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const alphaColor = (color: string, alpha: number) =>
    `color-mix(in srgb, ${color} ${(alpha * 100).toFixed(0)}%, transparent)`;

  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [data, setData] = useState<ProjectExportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [mobile, setMobile] = useState(isMobile());

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

  useEffect(() => {
    const handleResize = () => {
      setMobile(isMobile());
      if (!isMobile()) {
        setDrawerVisible(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      type: 'group' as const,
      label: '本地工作区',
      children: [
        {
          key: 'world-setting',
          icon: <GlobalOutlined />,
          label: <Link to={`/workspace/${workspaceName}/world-setting`}>世界设定</Link>,
        },
        {
          key: 'careers',
          icon: <TrophyOutlined />,
          label: <Link to={`/workspace/${workspaceName}/careers`}>职业管理</Link>,
        },
        {
          key: 'characters',
          icon: <TeamOutlined />,
          label: <Link to={`/workspace/${workspaceName}/characters`}>角色管理</Link>,
        },
        {
          key: 'organizations',
          icon: <BankOutlined />,
          label: <Link to={`/workspace/${workspaceName}/organizations`}>组织管理</Link>,
        },
        {
          key: 'relationships',
          icon: <ApartmentOutlined />,
          label: <Link to={`/workspace/${workspaceName}/relationships`}>关系管理</Link>,
        },
        {
          key: 'relationships-graph',
          icon: <ApartmentOutlined />,
          label: <Link to={`/workspace/${workspaceName}/relationships-graph`}>关系图谱</Link>,
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
          key: 'chapter-analysis',
          icon: <FundOutlined />,
          label: <Link to={`/workspace/${workspaceName}/chapter-analysis`}>剧情分析</Link>,
        },
        {
          key: 'foreshadows',
          icon: <BulbOutlined />,
          label: <Link to={`/workspace/${workspaceName}/foreshadows`}>伏笔管理</Link>,
        },
      ],
    },
    {
      type: 'group' as const,
      label: '创作工具',
      children: [
        {
          key: 'writing-styles',
          icon: <EditOutlined />,
          label: <Link to={`/workspace/${workspaceName}/writing-styles`}>写作风格</Link>,
        },
      ],
    },
  ];

  const menuItemsCollapsed = [
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
      key: 'careers',
      icon: <TrophyOutlined />,
      label: <Link to={`/workspace/${workspaceName}/careers`}>职业管理</Link>,
    },
    {
      key: 'characters',
      icon: <TeamOutlined />,
      label: <Link to={`/workspace/${workspaceName}/characters`}>角色管理</Link>,
    },
    {
      key: 'organizations',
      icon: <BankOutlined />,
      label: <Link to={`/workspace/${workspaceName}/organizations`}>组织管理</Link>,
    },
    {
      key: 'relationships',
      icon: <ApartmentOutlined />,
      label: <Link to={`/workspace/${workspaceName}/relationships`}>关系管理</Link>,
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
    {
      key: 'chapter-analysis',
      icon: <FundOutlined />,
      label: <Link to={`/workspace/${workspaceName}/chapter-analysis`}>剧情分析</Link>,
    },
    {
      key: 'writing-styles',
      icon: <EditOutlined />,
      label: <Link to={`/workspace/${workspaceName}/writing-styles`}>写作风格</Link>,
    },
  ];

  const selectedKey = useMemo(() => {
    const path = location.pathname;
    if (path.includes('/world-setting')) return 'world-setting';
    if (path.includes('/careers')) return 'careers';
    if (path.includes('/characters')) return 'characters';
    if (path.includes('/organizations')) return 'organizations';
    if (path.includes('/relationships')) return 'relationships';
    if (path.includes('/outline')) return 'outline';
    if (path.includes('/chapters')) return 'chapters';
    if (path.includes('/chapter-analysis')) return 'chapter-analysis';
    if (path.includes('/foreshadows')) return 'foreshadows';
    if (path.includes('/writing-styles')) return 'writing-styles';
    if (path.includes('/relationships-graph')) return 'relationships-graph';
    return 'overview';
  }, [location.pathname]);

  if (loading || !summary || !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  const currentWorkspaceName = workspaceName || summary.name;
  const stats = projectStats(data);

  const renderMenu = () => (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      <Menu
        mode="inline"
        inlineCollapsed={collapsed}
        selectedKeys={[selectedKey]}
        style={{ borderRight: 0, paddingTop: '12px' }}
        items={collapsed ? menuItemsCollapsed : menuItems}
        onClick={() => mobile && setDrawerVisible(false)}
      />
    </div>
  );

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
      <Layout style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden' }}>
        <Header
          style={{
            background: token.colorPrimary,
            padding: mobile ? '0 12px' : '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'fixed',
            top: 0,
            left: mobile ? 0 : collapsed ? 60 : 220,
            right: 0,
            zIndex: 1000,
            boxShadow: `0 2px 10px ${alphaColor(token.colorText, 0.16)}`,
            height: mobile ? 56 : 70,
            transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, zIndex: 1 }}>
            {mobile && (
              <Button
                type="text"
                icon={<MenuUnfoldOutlined />}
                onClick={() => setDrawerVisible(true)}
                style={{
                  fontSize: 18,
                  color: token.colorWhite,
                  width: 36,
                  height: 36,
                }}
              />
            )}
          </div>

          <h2
            style={{
              margin: 0,
              color: token.colorWhite,
              fontSize: mobile ? 16 : 24,
              fontWeight: 600,
              textShadow: `0 2px 4px ${alphaColor(token.colorText, 0.2)}`,
              position: mobile ? 'static' : 'absolute',
              left: mobile ? 'auto' : '50%',
              transform: mobile ? 'none' : 'translateX(-50%)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: mobile ? 1 : 'none',
              textAlign: mobile ? 'center' : 'left',
              paddingLeft: mobile ? '8px' : '0',
              paddingRight: mobile ? '8px' : '0',
              maxWidth: mobile ? 'none' : '48vw',
            }}
          >
            {data.project.title || summary.project_title || currentWorkspaceName}
          </h2>

          {mobile && (
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/')}
              style={{
                fontSize: 14,
                color: token.colorWhite,
                height: 36,
                padding: '0 8px',
                zIndex: 1,
              }}
            >
              主页
            </Button>
          )}

          {!mobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, zIndex: 1 }}>
              <div style={{ display: 'flex', gap: 16 }}>
                {stats.map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backdropFilter: 'blur(4px)',
                      borderRadius: '28px',
                      minWidth: '56px',
                      height: '56px',
                      padding: '0 12px',
                      boxShadow: `inset 0 0 15px ${alphaColor(token.colorWhite, 0.15)}, 0 4px 10px ${alphaColor(token.colorText, 0.1)}`,
                      cursor: 'default',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: alphaColor(token.colorWhite, 0.9),
                        marginBottom: 2,
                        lineHeight: 1,
                      }}
                    >
                      {item.label}
                    </span>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: token.colorWhite,
                        lineHeight: 1,
                        fontFamily: 'Monaco, monospace',
                      }}
                    >
                      {item.value > 10000 ? `${(item.value / 10000).toFixed(1)}w` : item.value}
                      <span style={{ fontSize: 10, marginLeft: 2, opacity: 0.8 }}>{item.unit}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Header>

        <Layout style={{ marginTop: mobile ? 56 : 70 }}>
          {mobile ? (
            <Drawer
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      background: token.colorPrimary,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: token.colorWhite,
                      fontSize: 16,
                    }}
                  >
                    <BookOutlined />
                  </div>
                  <span style={{ fontWeight: 600, fontSize: 16 }}>Workspace Studio</span>
                </div>
              }
              placement="left"
              onClose={() => setDrawerVisible(false)}
              open={drawerVisible}
              width={280}
              styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
            >
              {renderMenu()}
            </Drawer>
          ) : (
            <Sider
              collapsible
              collapsed={collapsed}
              onCollapse={setCollapsed}
              trigger={null}
              width={220}
              collapsedWidth={60}
              style={{
                position: 'fixed',
                left: 0,
                top: 0,
                bottom: 0,
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                height: '100vh',
                background: token.colorBgContainer,
                borderRight: `1px solid ${token.colorBorderSecondary}`,
                boxShadow: `4px 0 16px ${alphaColor(token.colorText, 0.06)}`,
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    height: 70,
                    display: 'flex',
                    alignItems: 'center',
                    padding: collapsed ? 0 : '0 12px',
                    background: token.colorPrimary,
                    flexShrink: 0,
                    justifyContent: collapsed ? 'center' : 'space-between',
                    gap: 8,
                  }}
                >
                  {collapsed ? (
                    <Button
                      type="text"
                      icon={<MenuUnfoldOutlined />}
                      onClick={() => setCollapsed(false)}
                      style={{
                        color: token.colorWhite,
                        width: '100%',
                        height: '100%',
                        padding: 0,
                        borderRadius: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    />
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: 30,
                            height: 30,
                            background: alphaColor(token.colorWhite, 0.2),
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: token.colorWhite,
                            fontSize: 16,
                            backdropFilter: 'blur(4px)',
                          }}
                        >
                          <BookOutlined />
                        </div>
                        <span
                          style={{
                            color: token.colorWhite,
                            fontWeight: 600,
                            fontSize: 15,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          Workspace Studio
                        </span>
                      </div>
                      <Button
                        type="text"
                        icon={<MenuFoldOutlined />}
                        onClick={() => setCollapsed(true)}
                        style={{
                          color: token.colorWhite,
                          width: 32,
                          height: 32,
                          padding: 0,
                          flexShrink: 0,
                        }}
                      />
                    </>
                  )}
                </div>
                {renderMenu()}
                <div
                  style={{
                    padding: collapsed ? '12px 8px' : '12px',
                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                    flexShrink: 0,
                  }}
                >
                  {collapsed ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <Button
                        type="text"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigate('/')}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          background: alphaColor(token.colorBgContainer, 0.65),
                          border: `1px solid ${token.colorBorder}`,
                          color: token.colorText,
                          padding: 0,
                        }}
                      />
                    </div>
                  ) : (
                    <Button
                      type="text"
                      icon={<ArrowLeftOutlined />}
                      onClick={() => navigate('/')}
                      block
                      style={{
                        color: token.colorText,
                        height: 40,
                        justifyContent: 'flex-start',
                        padding: '0 12px',
                      }}
                    >
                      返回主页
                    </Button>
                  )}
                </div>
              </div>
            </Sider>
          )}

          <Layout
            style={{
              marginLeft: mobile ? 0 : collapsed ? 60 : 220,
              transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <Content
              style={{
                background: token.colorBgLayout,
                padding: mobile ? 12 : 24,
                height: mobile ? 'calc(100vh - 56px)' : 'calc(100vh - 70px)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  background: token.colorBgContainer,
                  padding: mobile ? 12 : 24,
                  borderRadius: mobile ? 8 : 12,
                  boxShadow: `0 8px 24px ${alphaColor(token.colorText, 0.08)}`,
                  height: '100%',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Outlet context={{ loading, saving }} />
              </div>
            </Content>
          </Layout>
        </Layout>
      </Layout>
    </WorkspaceContext.Provider>
  );
}
