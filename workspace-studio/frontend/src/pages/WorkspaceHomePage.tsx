import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Button,
  Card,
  Col,
  Input,
  Layout,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  CloudDownloadOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  SyncOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { studioApi } from '../api';
import type { MumuProject, WorkspaceSummary } from '../types';

const { Header, Content } = Layout;
const { Title, Paragraph, Text } = Typography;

export default function WorkspaceHomePage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [mumuProjects, setMumuProjects] = useState<MumuProject[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceNameDrafts, setWorkspaceNameDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [mumu, local] = await Promise.all([
        studioApi.getMumuProjects(),
        studioApi.getWorkspaces(),
      ]);
      setMumuProjects(mumu.items);
      setWorkspaces(local.items);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handlePullWorkspace = async (project: MumuProject) => {
    try {
      const summary = await studioApi.exportWorkspace(
        project.id,
        workspaceNameDrafts[project.id] || undefined,
      );
      message.success(`已生成工作区：${summary.name}`);
      await loadAll();
      navigate(`/workspace/${encodeURIComponent(summary.name)}/overview`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '拉取失败');
    }
  };

  const handleValidateWorkspace = async (workspace: WorkspaceSummary) => {
    try {
      const result = await studioApi.validateWorkspace(workspace.name);
      if (result.valid) {
        message.success(`工作区校验通过：${workspace.name}`);
      } else {
        message.error(`校验失败：${result.errors.join('；')}`);
      }
      await loadAll();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '校验失败');
    }
  };

  const handleSyncWorkspace = async (workspace: WorkspaceSummary) => {
    try {
      const result = await studioApi.syncWorkspace(workspace.name, workspace.source_project_id || undefined);
      if (result.result.success) {
        message.success(`同步成功，已备份到：${result.backup_path}`);
      } else {
        message.error(result.result.message);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '同步失败');
    }
  };

  const handleDeleteWorkspace = async (workspace: WorkspaceSummary) => {
    try {
      await studioApi.deleteWorkspace(workspace.name);
      message.success(`已删除工作区：${workspace.name}`);
      await loadAll();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败');
    }
  };

  return (
    <Layout className="studio-page">
      <Header
        style={{
          background: 'transparent',
          padding: '24px 32px 0',
          height: 'auto',
        }}
      >
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Title level={2} style={{ margin: 0 }}>
            Workspace Studio
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            直接管理本地工作区，拉取 MuMu 书籍，编辑本地 Markdown，再严格同步回指定项目。
          </Paragraph>
        </Space>
      </Header>

      <Content style={{ padding: '24px 32px 40px' }}>
        <Row gutter={24}>
          <Col xs={24} xl={12}>
            <Card
              className="studio-card"
              title="MuMu 书籍"
              extra={
                <Button icon={<ReloadOutlined />} onClick={loadAll} loading={loading}>
                  刷新
                </Button>
              }
            >
              <Table<MumuProject>
                rowKey="id"
                size="small"
                pagination={false}
                loading={loading}
                dataSource={mumuProjects}
                columns={[
                  {
                    title: '标题',
                    dataIndex: 'title',
                    render: (value, record) => (
                      <Space direction="vertical" size={4}>
                        <Text strong>{value}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {record.id}
                        </Text>
                      </Space>
                    ),
                  },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    width: 90,
                    render: (value) => <Tag color="green">{value}</Tag>,
                  },
                  {
                    title: '拉取',
                    width: 240,
                    render: (_, record) => (
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Input
                          size="small"
                          placeholder="可选：自定义工作区名"
                          value={workspaceNameDrafts[record.id]}
                          onChange={(event) =>
                            setWorkspaceNameDrafts((prev) => ({
                              ...prev,
                              [record.id]: event.target.value,
                            }))
                          }
                        />
                        <Button
                          size="small"
                          type="primary"
                          icon={<CloudDownloadOutlined />}
                          onClick={() => handlePullWorkspace(record)}
                        >
                          拉到工作区
                        </Button>
                      </Space>
                    ),
                  },
                ]}
              />
            </Card>
          </Col>

          <Col xs={24} xl={12}>
            <Card
              className="studio-card"
              title="本地工作区"
              extra={
                <Button icon={<ReloadOutlined />} onClick={loadAll} loading={loading}>
                  刷新
                </Button>
              }
            >
              <Table<WorkspaceSummary>
                rowKey="name"
                size="small"
                pagination={false}
                loading={loading}
                dataSource={workspaces}
                columns={[
                  {
                    title: '工作区',
                    dataIndex: 'name',
                    render: (value, record) => (
                      <Space direction="vertical" size={4}>
                        <Text strong>{record.project_title || value}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {value}
                        </Text>
                        {record.source_project_id && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            source_project_id: {record.source_project_id}
                          </Text>
                        )}
                      </Space>
                    ),
                  },
                  {
                    title: '状态',
                    width: 120,
                    render: (_, record) => (
                      <Space direction="vertical" size={4}>
                        <Tag color={record.valid ? 'green' : 'red'}>{record.valid ? '有效' : '异常'}</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {dayjs(record.updated_at).format('MM-DD HH:mm')}
                        </Text>
                      </Space>
                    ),
                  },
                  {
                    title: '操作',
                    width: 240,
                    render: (_, record) => (
                      <Space wrap>
                        <Button
                          size="small"
                          icon={<FolderOpenOutlined />}
                          onClick={() => navigate(`/workspace/${encodeURIComponent(record.name)}/overview`)}
                        >
                          打开
                        </Button>
                        <Button
                          size="small"
                          icon={<FileSearchOutlined />}
                          onClick={() => handleValidateWorkspace(record)}
                        >
                          校验
                        </Button>
                        <Button
                          size="small"
                          type="primary"
                          icon={<SyncOutlined />}
                          onClick={() => handleSyncWorkspace(record)}
                          disabled={!record.source_project_id}
                        >
                          同步
                        </Button>
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleDeleteWorkspace(record)}
                        >
                          删除
                        </Button>
                      </Space>
                    ),
                  },
                ]}
              />
            </Card>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}
