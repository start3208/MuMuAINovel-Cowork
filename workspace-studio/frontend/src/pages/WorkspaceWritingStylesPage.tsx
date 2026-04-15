import { useState } from 'react';
import { App, Button, Card, Empty, Form, Input, List, Modal, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useWorkspaceContext } from '../workspace-context';
import { deleteWritingStyleAtIndex, setDefaultWritingStyle, updateWritingStyleAtIndex } from '../workspace-utils';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

export default function WorkspaceWritingStylesPage() {
  const { message, modal } = App.useApp();
  const { data, saveData } = useWorkspaceContext();
  const [form] = Form.useForm();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const styles = data.writing_styles || [];
  const defaultStyleName = data.project_default_style?.style_name || null;

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingIndex(null);
    form.resetFields();
  };

  const openModal = (style?: any, index?: number) => {
    if (style && index !== undefined) {
      setEditingIndex(index);
      form.setFieldsValue(style);
    } else {
      setEditingIndex(null);
      form.resetFields();
      form.setFieldsValue({ style_type: 'custom', order_index: styles.length });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (values: any) => {
    try {
      if (editingIndex !== null) {
        const nextData = updateWritingStyleAtIndex(data, editingIndex, {
          ...styles[editingIndex],
          ...values,
        });
        await saveData(nextData);
      } else {
        const nextData = JSON.parse(JSON.stringify(data));
        nextData.writing_styles.push(values);
        await saveData(nextData);
      }
      message.success(editingIndex !== null ? '写作风格已更新' : '写作风格已创建');
      closeModal();
    } catch {
      // saveData handles errors
    }
  };

  const handleDelete = (index: number) => {
    const style = styles[index];
    if (!style) return;
    if (defaultStyleName === style.name) {
      modal.warning({
        title: '默认风格不能直接删除',
        centered: true,
        content: (
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Paragraph style={{ marginBottom: 0 }}>
              风格 <Text strong>{style.name}</Text> 当前被项目 <Text strong>{data.project.title || '当前项目'}</Text> 设为默认风格。
            </Paragraph>
            <Text type="secondary">请先将其他风格设为默认，再删除这个风格。</Text>
          </Space>
        ),
        okText: '知道了',
      });
      return;
    }
    modal.confirm({
      title: '确认删除写作风格',
      content: '仅影响本地工作区。',
      centered: true,
      onOk: async () => {
        try {
          const nextData = deleteWritingStyleAtIndex(data, index);
          await saveData(nextData);
          message.success('写作风格已删除');
        } catch {
          // saveData handles errors
        }
      },
    });
  };

  const handleSetDefault = async (styleName: string) => {
    try {
      const nextData = setDefaultWritingStyle(data, styleName);
      await saveData(nextData);
      message.success(`已设为默认风格：${styleName}`);
    } catch {
      // saveData handles errors
    }
  };

  if (styles.length === 0) {
    return (
      <Card className="studio-card" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>新增风格</Button>}>
        <Empty description="当前工作区没有写作风格数据" />
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        className="studio-card"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            新增风格
          </Button>
        }
      >
        <Title level={3} style={{ margin: 0 }}>
          写作风格
        </Title>
      </Card>
      <List
        dataSource={styles}
        renderItem={(style: any, index) => (
          <Card className="studio-card" style={{ marginBottom: 16 }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
              <div>
                <Title level={4}>{style.name}</Title>
                <Space wrap>
                  <Tag color="blue">{style.style_type}</Tag>
                  {style.preset_id && <Tag>{style.preset_id}</Tag>}
                  {defaultStyleName === style.name && <Tag color="gold">默认风格</Tag>}
                </Space>
              </div>
              <Space wrap>
                <Button size="small" onClick={() => handleSetDefault(style.name)}>
                  设为默认
                </Button>
                <Button size="small" icon={<EditOutlined />} onClick={() => openModal(style, index)}>
                  编辑
                </Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(index)}>
                  删除
                </Button>
              </Space>
            </Space>
            <Paragraph>{style.description || '暂无说明'}</Paragraph>
            <div style={{ marginTop: 12 }}>
              <Text strong>Prompt 内容</Text>
              <Paragraph style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{style.prompt_content}</Paragraph>
            </div>
          </Card>
        )}
      />

      <Modal
        title={editingIndex !== null ? '编辑写作风格' : '新增写作风格'}
        open={isModalOpen}
        onCancel={closeModal}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="风格名称" rules={[{ required: true, message: '请输入风格名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="style_type" label="风格类型" rules={[{ required: true, message: '请输入风格类型' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="preset_id" label="预设ID">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="风格说明">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item name="prompt_content" label="Prompt 内容" rules={[{ required: true, message: '请输入 Prompt 内容' }]}>
            <TextArea rows={10} />
          </Form.Item>
          <Form.Item name="order_index" label="排序序号">
            <Input />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={closeModal}>取消</Button>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
