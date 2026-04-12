import { App, Button, Card, Form, Input, InputNumber, Space } from 'antd';
import { useWorkspaceContext } from '../workspace-context';
import { cloneData } from '../workspace-utils';

const { TextArea } = Input;

export default function WorkspaceWorldSettingPage() {
  const { message } = App.useApp();
  const { data, saveData } = useWorkspaceContext();
  const [form] = Form.useForm();

  const initialValues = {
    title: data.project.title,
    genre: data.project.genre,
    target_words: data.project.target_words,
    narrative_perspective: data.project.narrative_perspective,
    description: data.project.description,
    theme: data.project.theme,
    world_time_period: data.project.world_time_period,
    world_location: data.project.world_location,
    world_atmosphere: data.project.world_atmosphere,
    world_rules: data.project.world_rules,
  };

  const handleSave = async (values: any) => {
    const nextData = cloneData(data);
    nextData.project = {
      ...nextData.project,
      ...values,
    };
    try {
      await saveData(nextData);
      message.success('世界设定已保存');
    } catch {
      // saveData already shows the error
    }
  };

  return (
    <Card className="studio-card">
      <Form layout="vertical" form={form} initialValues={initialValues} onFinish={handleSave}>
        <Form.Item name="title" label="书名">
          <Input />
        </Form.Item>
        <Space style={{ width: '100%' }} size={16} align="start">
          <Form.Item name="genre" label="类型" style={{ flex: 1 }}>
            <Input />
          </Form.Item>
          <Form.Item name="narrative_perspective" label="叙事视角" style={{ flex: 1 }}>
            <Input />
          </Form.Item>
          <Form.Item name="target_words" label="目标字数" style={{ width: 180 }}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Space>
        <Form.Item name="description" label="项目简介">
          <TextArea rows={5} />
        </Form.Item>
        <Form.Item name="theme" label="主题">
          <TextArea rows={4} />
        </Form.Item>
        <Form.Item name="world_time_period" label="时间背景">
          <TextArea rows={6} />
        </Form.Item>
        <Form.Item name="world_location" label="地理位置">
          <TextArea rows={6} />
        </Form.Item>
        <Form.Item name="world_atmosphere" label="氛围基调">
          <TextArea rows={6} />
        </Form.Item>
        <Form.Item name="world_rules" label="世界规则">
          <TextArea rows={6} />
        </Form.Item>
        <Button type="primary" htmlType="submit">
          保存到本地工作区
        </Button>
      </Form>
    </Card>
  );
}
