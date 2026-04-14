import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Button,
  Card,
  Input,
  Layout,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  ImportOutlined,
  ReloadOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { studioApi } from '../api';
import type { BackupManifest } from '../types';

const { Header, Content } = Layout;
const { Title, Paragraph, Text } = Typography;

export default function WorkspaceBackupsPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>();
  const [projectFilter, setProjectFilter] = useState('');
  const [backups, setBackups] = useState<BackupManifest[]>([]);

  const loadBackups = async (nextSource = sourceFilter, nextProject = projectFilter) => {
    setLoading(true);
    try {
      const result = await studioApi.getBackups(nextSource, nextProject.trim() || undefined);
      setBackups(result.items);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载备份失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBackups();
  }, []);

  const stats = useMemo(() => {
    return {
      total: backups.length,
      ws: backups.filter((item) => item.source_type === 'ws').length,
      mumu: backups.filter((item) => item.source_type === 'mumu').length,
    };
  }, [backups]);

  const handleImport = (backup: BackupManifest) => {
    modal.confirm({
      title: '确认导入备份',
      content: `将备份 ${backup.backup_id} 导入为工作区。来源：${backup.source_type}，项目：${backup.project_title}。`,
      centered: true,
      onOk: async () => {
        try {
          const summary = await studioApi.importBackupToWorkspace(
            backup.backup_id,
            backup.workspace_name || undefined,
          );
          message.success(`备份已导入到工作区：${summary.name}`);
          navigate(`/workspace/${encodeURIComponent(summary.name)}/overview`);
        } catch (error) {
          message.error(error instanceof Error ? error.message : '导入备份失败');
        }
      },
    });
  };

  const handleCleanup = () => {
    modal.confirm({
      title: '确认清理备份',
      content: '会分别对 ws 与 mumu 备份执行清理，每个项目仅保留最近 5 份。',
      centered: true,
      onOk: async () => {
        try {
          const result = await studioApi.cleanupBackups(5);
          message.success(`清理完成，共删除 ${result.removed} 份备份`);
          await loadBackups(sourceFilter, projectFilter);
        } catch (error) {
          message.error(error instanceof Error ? error.message : '清理备份失败');
        }
      },
    });
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
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
              返回首页
            </Button>
          </Space>
          <Title level={2} style={{ margin: 0 }}>
            备份管理
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            统一管理 `ws` 与 `mumu` 的 JSON 备份，可导入为工作区，也可按项目保留最近 5 份。
          </Paragraph>
        </Space>
      </Header>

      <Content style={{ padding: '24px 32px 40px' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card className="studio-card">
            <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space wrap>
                <Tag color="blue">总计 {stats.total}</Tag>
                <Tag color="green">ws {stats.ws}</Tag>
                <Tag color="gold">mumu {stats.mumu}</Tag>
              </Space>
              <Space wrap>
                <Select
                  allowClear
                  placeholder="来源过滤"
                  style={{ width: 140 }}
                  value={sourceFilter}
                  options={[
                    { label: 'ws', value: 'ws' },
                    { label: 'mumu', value: 'mumu' },
                  ]}
                  onChange={(value) => {
                    setSourceFilter(value);
                    void loadBackups(value, projectFilter);
                  }}
                />
                <Input
                  placeholder="按项目ID过滤"
                  style={{ width: 220 }}
                  value={projectFilter}
                  onChange={(event) => setProjectFilter(event.target.value)}
                  onPressEnter={() => void loadBackups(sourceFilter, projectFilter)}
                />
                <Button icon={<ReloadOutlined />} onClick={() => loadBackups(sourceFilter, projectFilter)} loading={loading}>
                  刷新
                </Button>
                <Button danger icon={<DeleteOutlined />} onClick={handleCleanup}>
                  清理备份
                </Button>
              </Space>
            </Space>
          </Card>

          <Card className="studio-card">
            <Table<BackupManifest>
              rowKey="backup_id"
              loading={loading}
              dataSource={backups}
              pagination={{ pageSize: 12, showSizeChanger: true }}
              columns={[
                {
                  title: '备份',
                  render: (_, record) => (
                    <Space direction="vertical" size={2}>
                      <Text strong>{record.project_title || record.project_id}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.backup_id}
                      </Text>
                    </Space>
                  ),
                },
                {
                  title: '来源',
                  width: 100,
                  render: (_, record) => <Tag color={record.source_type === 'ws' ? 'green' : 'gold'}>{record.source_type}</Tag>,
                },
                {
                  title: '项目ID',
                  dataIndex: 'project_id',
                  width: 220,
                },
                {
                  title: '原因',
                  dataIndex: 'reason',
                  width: 140,
                },
                {
                  title: '时间',
                  width: 150,
                  render: (_, record) => dayjs(record.created_at).format('MM-DD HH:mm:ss'),
                },
                {
                  title: '统计',
                  render: (_, record) => (
                    <Space wrap>
                      {Object.entries(record.statistics || {})
                        .slice(0, 4)
                        .map(([key, value]) => (
                          <Tag key={key}>{`${key}:${value}`}</Tag>
                        ))}
                    </Space>
                  ),
                },
                {
                  title: '操作',
                  width: 140,
                  render: (_, record) => (
                    <Button size="small" type="primary" icon={<ImportOutlined />} onClick={() => handleImport(record)}>
                      导入备份
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
        </Space>
      </Content>
    </Layout>
  );
}
