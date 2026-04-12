import { App, Button, Card, Form, Input, List, Space, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { useWorkspaceContext } from '../workspace-context';
import { cloneData, replaceItemByIndex } from '../workspace-utils';

const { TextArea } = Input;

export default function WorkspaceCharactersPage() {
  const { message } = App.useApp();
  const { data, saveData } = useWorkspaceContext();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [form] = Form.useForm();
  const selectedCharacter = data.characters[selectedIndex];

  useEffect(() => {
    form.setFieldsValue(selectedCharacter);
  }, [selectedCharacter, form]);

  if (!selectedCharacter) {
    return <Card>当前工作区没有角色。</Card>;
  }

  const handleSave = async (values: any) => {
    const nextData = cloneData(data);
    nextData.characters = replaceItemByIndex(nextData.characters, selectedIndex, {
      ...nextData.characters[selectedIndex],
      ...values,
    });
    try {
      await saveData(nextData);
      message.success('角色已保存');
    } catch {
      // saveData already handles errors
    }
  };

  return (
    <Space align="start" size={16} style={{ width: '100%' }}>
      <Card className="studio-card" style={{ width: 320 }}>
        <List
          itemLayout="horizontal"
          dataSource={data.characters}
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
                    <span>{item.name}</span>
                    {item.is_organization && <Tag color="blue">组织</Tag>}
                  </Space>
                }
                description={item.role_type || '未设置定位'}
              />
            </List.Item>
          )}
        />
      </Card>
      <Card className="studio-card" style={{ flex: 1 }}>
        <Form layout="vertical" form={form} initialValues={selectedCharacter} onFinish={handleSave}>
          <Form.Item name="name" label="名称">
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item name="role_type" label="角色定位" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="gender" label="性别" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="age" label="年龄" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Space>
          <Form.Item name="personality" label="性格">
            <TextArea rows={5} />
          </Form.Item>
          <Form.Item name="background" label="背景">
            <TextArea rows={6} />
          </Form.Item>
          <Form.Item name="appearance" label="外貌">
            <TextArea rows={6} />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            保存角色
          </Button>
        </Form>
      </Card>
    </Space>
  );
}
