import { App, Button, Card, Form, Input, List, Space, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { useWorkspaceContext } from '../workspace-context';
import { cloneData, replaceItemByIndex } from '../workspace-utils';

const { TextArea } = Input;

export default function WorkspaceForeshadowsPage() {
  const { message } = App.useApp();
  const { data, saveData } = useWorkspaceContext();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [form] = Form.useForm();
  const selectedForeshadow = data.foreshadows[selectedIndex];

  useEffect(() => {
    form.setFieldsValue(selectedForeshadow);
  }, [selectedForeshadow, form]);

  if (!selectedForeshadow) {
    return <Card>当前工作区没有伏笔。</Card>;
  }

  const handleSave = async (values: any) => {
    const nextData = cloneData(data);
    nextData.foreshadows = replaceItemByIndex(nextData.foreshadows, selectedIndex, {
      ...nextData.foreshadows[selectedIndex],
      ...values,
    });
    try {
      await saveData(nextData);
      message.success('伏笔已保存');
    } catch {}
  };

  return (
    <Space align="start" size={16} style={{ width: '100%' }}>
      <Card className="studio-card" style={{ width: 320 }}>
        <List
          dataSource={data.foreshadows}
          renderItem={(item, index) => (
            <List.Item
              style={{
                cursor: 'pointer',
                borderRadius: 12,
                paddingInline: 12,
                background: index === selectedIndex ? 'rgba(31,111,95,0.08)' : 'transparent',
              }}
              onClick={() => setSelectedIndex(index)}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <span>{item.title}</span>
                    <Tag color={item.status === 'resolved' ? 'green' : 'gold'}>{item.status}</Tag>
                  </Space>
                }
                description={item.category || '未分类'}
              />
            </List.Item>
          )}
        />
      </Card>
      <Card className="studio-card" style={{ flex: 1 }}>
        <Form layout="vertical" form={form} initialValues={selectedForeshadow} onFinish={handleSave}>
          <Form.Item name="title" label="标题">
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Input />
          </Form.Item>
          <Form.Item name="content" label="内容">
            <TextArea rows={8} />
          </Form.Item>
          <Form.Item name="hint_text" label="埋入提示">
            <TextArea rows={4} />
          </Form.Item>
          <Form.Item name="resolution_text" label="回收提示">
            <TextArea rows={4} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <TextArea rows={4} />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            保存伏笔
          </Button>
        </Form>
      </Card>
    </Space>
  );
}
