import { Card, Empty, List, Tag, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useWorkspaceContext } from '../workspace-context';

const { Title, Paragraph, Text } = Typography;

export default function WorkspaceWritingStylesPage() {
  const { data } = useWorkspaceContext();
  const styles = data.writing_styles || [];

  if (styles.length === 0) {
    return (
      <Card className="studio-card">
        <Empty description="当前工作区没有写作风格数据" />
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card className="studio-card">
        <Title level={3} style={{ margin: 0 }}>
          <EditOutlined style={{ marginRight: 8 }} />
          写作风格
        </Title>
      </Card>
      <List
        dataSource={styles}
        renderItem={(style: any) => (
          <Card className="studio-card" style={{ marginBottom: 16 }}>
            <Title level={4}>{style.name}</Title>
            <Paragraph>{style.description || '暂无说明'}</Paragraph>
            <Tag color="blue">{style.style_type}</Tag>
            {style.preset_id && <Tag>{style.preset_id}</Tag>}
            <div style={{ marginTop: 12 }}>
              <Text strong>Prompt 内容</Text>
              <Paragraph style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{style.prompt_content}</Paragraph>
            </div>
          </Card>
        )}
      />
    </div>
  );
}
