import { App, Button, Card, Form, Input, List, Space } from 'antd';
import { useEffect, useState } from 'react';
import { useWorkspaceContext } from '../workspace-context';
import { cloneData, replaceItemByIndex } from '../workspace-utils';

const { TextArea } = Input;

export default function WorkspaceOutlinePage() {
  const { message } = App.useApp();
  const { data, saveData } = useWorkspaceContext();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [form] = Form.useForm();
  const selectedOutline = data.outlines[selectedIndex];

  useEffect(() => {
    form.setFieldsValue(selectedOutline);
  }, [selectedOutline, form]);

  if (!selectedOutline) {
    return <Card>当前工作区没有大纲。</Card>;
  }

  const handleSave = async (values: any) => {
    const nextData = cloneData(data);
    nextData.outlines = replaceItemByIndex(nextData.outlines, selectedIndex, {
      ...nextData.outlines[selectedIndex],
      ...values,
    });
    try {
      await saveData(nextData);
      message.success('大纲已保存');
    } catch {}
  };

  return (
    <Space align="start" size={16} style={{ width: '100%' }}>
      <Card className="studio-card" style={{ width: 320 }}>
        <List
          dataSource={data.outlines}
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
              <List.Item.Meta title={item.title} description={`order_index=${item.order_index ?? index + 1}`} />
            </List.Item>
          )}
        />
      </Card>
      <Card className="studio-card" style={{ flex: 1 }}>
        <Form layout="vertical" form={form} initialValues={selectedOutline} onFinish={handleSave}>
          <Form.Item name="title" label="标题">
            <Input />
          </Form.Item>
          <Form.Item name="content" label="内容摘要">
            <TextArea rows={8} />
          </Form.Item>
          <Form.Item name="structure" label="结构 JSON 字符串">
            <TextArea rows={12} />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            保存大纲
          </Button>
        </Form>
      </Card>
    </Space>
  );
}
