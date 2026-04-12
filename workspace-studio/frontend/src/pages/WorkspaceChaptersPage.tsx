import { App, Button, Card, Form, Input, List, Space, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { useWorkspaceContext } from '../workspace-context';
import { cloneData, replaceItemByIndex } from '../workspace-utils';

const { TextArea } = Input;

export default function WorkspaceChaptersPage() {
  const { message } = App.useApp();
  const { data, saveData } = useWorkspaceContext();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [form] = Form.useForm();
  const selectedChapter = data.chapters[selectedIndex];

  useEffect(() => {
    form.setFieldsValue(selectedChapter);
  }, [selectedChapter, form]);

  if (!selectedChapter) {
    return <Card>当前工作区没有章节。</Card>;
  }

  const handleSave = async (values: any) => {
    const nextData = cloneData(data);
    nextData.chapters = replaceItemByIndex(nextData.chapters, selectedIndex, {
      ...nextData.chapters[selectedIndex],
      ...values,
    });
    try {
      await saveData(nextData);
      message.success('章节已保存');
    } catch {}
  };

  return (
    <Space align="start" size={16} style={{ width: '100%' }}>
      <Card className="studio-card" style={{ width: 320 }}>
        <List
          dataSource={data.chapters}
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
                    <Tag color="blue">第{item.chapter_number}章</Tag>
                  </Space>
                }
                description={item.outline_title || '未关联大纲'}
              />
            </List.Item>
          )}
        />
      </Card>
      <Card className="studio-card" style={{ flex: 1 }}>
        <Form layout="vertical" form={form} initialValues={selectedChapter} onFinish={handleSave}>
          <Form.Item name="title" label="章节标题">
            <Input />
          </Form.Item>
          <Form.Item name="summary" label="章节摘要">
            <TextArea rows={5} />
          </Form.Item>
          <Form.Item name="content" label="章节正文">
            <TextArea rows={18} />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            保存章节
          </Button>
        </Form>
      </Card>
    </Space>
  );
}
