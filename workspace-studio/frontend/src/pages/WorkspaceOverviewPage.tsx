import { App, Button, Card, Descriptions, Space, Typography } from 'antd';
import { FileSearchOutlined, SyncOutlined } from '@ant-design/icons';
import { studioApi } from '../api';
import { useWorkspaceContext } from '../workspace-context';

const { Paragraph } = Typography;

export default function WorkspaceOverviewPage() {
  const { message } = App.useApp();
  const { workspaceName, summary, data, reload } = useWorkspaceContext();

  const handleValidate = async () => {
    try {
      const result = await studioApi.validateWorkspace(workspaceName);
      if (result.valid) {
        message.success('工作区校验通过');
      } else {
        message.error(`校验失败：${result.errors.join('；')}`);
      }
      await reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '校验失败');
    }
  };

  const handleSync = async () => {
    try {
      const result = await studioApi.syncWorkspace(workspaceName, summary.source_project_id || undefined);
      if (result.result.success) {
        message.success(`同步成功，备份文件：${result.backup_path}`);
      } else {
        message.error(result.result.message);
      }
      await reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '同步失败');
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card className="studio-card">
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <Typography.Title level={3} style={{ marginTop: 0 }}>
              工作区概览
            </Typography.Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              这个页面复刻了 MuMu 项目壳页，但所有修改都落在本地工作区 Markdown，不会自动写回 MuMu。
            </Paragraph>
          </div>
          <Space>
            <Button icon={<FileSearchOutlined />} onClick={handleValidate}>
              校验工作区
            </Button>
            <Button
              type="primary"
              icon={<SyncOutlined />}
              onClick={handleSync}
              disabled={!summary.source_project_id}
            >
              同步回原书
            </Button>
          </Space>
        </Space>
      </Card>

      <Card className="studio-card">
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="工作区名称">{summary.name}</Descriptions.Item>
          <Descriptions.Item label="来源项目ID">
            {summary.source_project_id || '未记录'}
          </Descriptions.Item>
          <Descriptions.Item label="版本">{data.version}</Descriptions.Item>
          <Descriptions.Item label="导出时间">{data.export_time}</Descriptions.Item>
          <Descriptions.Item label="项目状态">{data.project.status || 'unknown'}</Descriptions.Item>
          <Descriptions.Item label="当前字数">{data.project.current_words || 0}</Descriptions.Item>
        </Descriptions>
      </Card>
    </Space>
  );
}
