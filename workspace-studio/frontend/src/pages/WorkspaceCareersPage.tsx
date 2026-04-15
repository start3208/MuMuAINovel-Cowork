import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Row,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { useWorkspaceContext } from '../workspace-context';
import { cloneData, deleteCareerAtIndex, getCareerUsageCount, updateCareerAtIndex } from '../workspace-utils';

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

interface CareerStage {
  level: number;
  name: string;
  description?: string;
}

interface CareerRecord {
  name: string;
  type: 'main' | 'sub';
  description?: string;
  category?: string;
  stages: string;
  max_stage: number;
  requirements?: string;
  special_abilities?: string;
  worldview_rules?: string;
  source: string;
  created_at?: string;
}

function parseStages(raw: string | undefined): CareerStage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item, index) => ({
        level: Number(item.level ?? index + 1),
        name: String(item.name ?? `阶段${index + 1}`),
        description: item.description ? String(item.description) : '',
      }));
    }
  } catch {
    // ignore invalid json, fallback below
  }
  return [];
}

function stagesToEditorText(stages: CareerStage[]): string {
  return stages
    .map((stage) => `${stage.level}. ${stage.name}${stage.description ? ` - ${stage.description}` : ''}`)
    .join('\n');
}

function editorTextToStages(text: string): CareerStage[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^(\d+)\.\s*([^-]+?)(?:\s*-\s*(.*))?$/);
      if (match) {
        return {
          level: Number(match[1]),
          name: match[2].trim(),
          description: match[3]?.trim() || '',
        };
      }
      return {
        level: index + 1,
        name: line,
        description: '',
      };
    });
}

export default function WorkspaceCareersPage() {
  const { message, modal } = App.useApp();
  const { data, saveData } = useWorkspaceContext();
  const { token } = theme.useToken();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form] = Form.useForm();
  const panelBg = token.colorBgContainer;
  const cardBg = token.colorFillAlter;
  const borderColor = token.colorBorderSecondary;
  const textMuted = token.colorTextSecondary;

  const careers = useMemo(() => (data.careers || []) as CareerRecord[], [data.careers]);
  const mainCareers = careers.filter((career) => career.type === 'main');
  const subCareers = careers.filter((career) => career.type === 'sub');

  const openModal = (career?: CareerRecord, index?: number) => {
    if (career && index !== undefined) {
      setEditingIndex(index);
      form.setFieldsValue({
        ...career,
        stages_editor: stagesToEditorText(parseStages(career.stages)),
      });
    } else {
      setEditingIndex(null);
      form.resetFields();
      form.setFieldsValue({ type: 'main', source: 'manual', stages_editor: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingIndex(null);
    form.resetFields();
  };

  const persistCareers = async (nextCareers: CareerRecord[]) => {
    const nextData = cloneData(data);
    nextData.careers = nextCareers as any;
    await saveData(nextData);
  };

  const handleSubmit = async (values: any) => {
    const stages = editorTextToStages(values.stages_editor || '');
    const payload: CareerRecord = {
      name: values.name,
      type: values.type,
      description: values.description,
      category: values.category,
      stages: JSON.stringify(stages, undefined, 0),
      max_stage: stages.length,
      requirements: values.requirements,
      special_abilities: values.special_abilities,
      worldview_rules: values.worldview_rules,
      source: values.source || 'manual',
      created_at: editingIndex !== null ? careers[editingIndex].created_at : undefined,
    };

    try {
      if (editingIndex !== null) {
        const nextData = updateCareerAtIndex(data, editingIndex, payload as any);
        await saveData(nextData);
      } else {
        const nextCareers = [...careers, payload];
        await persistCareers(nextCareers);
      }
      message.success(editingIndex !== null ? '职业已更新' : '职业已新增');
      closeModal();
    } catch {
      // handled by saveData
    }
  };

  const handleDelete = (index: number) => {
    const career = careers[index];
    if (!career) return;
    const usageItems = (data.character_careers || []).filter((mapping) => mapping.career_name === career.name);
    const usageCount = getCareerUsageCount(data, career.name);
    if (usageCount > 0) {
      modal.warning({
        title: '该职业仍在使用中',
        centered: true,
        width: 640,
        content: (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Paragraph style={{ marginBottom: 0 }}>
              不能删除职业 <Text strong>{career.name}</Text>，当前仍有 {usageCount} 个角色职业关联绑定它：
            </Paragraph>
            <List
              size="small"
              bordered
              dataSource={usageItems}
              renderItem={(item: any) => (
                <List.Item>
                  <Space wrap>
                    <Tag color="blue">{item.character_name}</Tag>
                    <Tag>{item.career_type}</Tag>
                    <Text type="secondary">当前阶段：{item.current_stage ?? 1}</Text>
                  </Space>
                </List.Item>
              )}
            />
            <Text type="secondary">请先在角色职业关联中移除这些绑定，再删除职业。</Text>
          </Space>
        ),
        okText: '知道了',
      });
      return;
    }
    modal.confirm({
      title: '确认删除职业',
      content: '这个操作只会修改本地工作区，不会立即同步到 MuMu。',
      centered: true,
      onOk: async () => {
        try {
          const nextData = deleteCareerAtIndex(data, index);
          await saveData(nextData);
          message.success('职业已删除');
        } catch {
          // handled by saveData
        }
      },
    });
  };

  const handleAiGenerate = () => {
    message.info('AI 生成职业后续会接入，本地版目前先保留手动管理。');
  };

  const renderCareerCard = (career: CareerRecord, index: number) => {
    const stages = parseStages(career.stages);
    return (
      <Card
        key={`${career.name}-${index}`}
        title={
          <Space>
            <TrophyOutlined />
            {career.name}
            <Tag color={career.source === 'ai' ? 'blue' : 'default'}>
              {career.source === 'ai' ? 'AI生成' : '手动创建'}
            </Tag>
            {career.category && <Tag>{career.category}</Tag>}
          </Space>
        }
        extra={
          <Space>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openModal(career, index)}
              style={{
                background: 'transparent',
                borderColor,
                color: token.colorText,
              }}
            />
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(index)}
              style={{ background: 'transparent' }}
            />
          </Space>
        }
        style={{
          marginBottom: 16,
          background: cardBg,
          borderColor,
          boxShadow: 'none',
          borderRadius: 18,
        }}
        headStyle={{
          color: token.colorText,
          borderBottom: `1px solid ${borderColor}`,
        }}
        bodyStyle={{ color: token.colorText }}
      >
        <Paragraph ellipsis={{ rows: 2 }} style={{ color: token.colorText, opacity: 0.92 }}>
          {career.description || '暂无描述'}
        </Paragraph>
        <Divider style={{ margin: '12px 0', borderColor }} />
        <Text strong style={{ color: token.colorText }}>
          阶段体系（共{career.max_stage || stages.length}个）：
        </Text>
        <div style={{ maxHeight: 140, overflowY: 'auto', marginTop: 8, paddingRight: 8 }}>
          {stages.slice(0, 5).map((stage) => (
            <div key={`${career.name}-${stage.level}`} style={{ marginLeft: 16, marginBottom: 4 }}>
              <Text style={{ color: textMuted }}>
                {stage.level}. {stage.name}
              </Text>
              {stage.description && (
                <Text style={{ fontSize: 12, color: textMuted }}>
                  {' '}
                  - {stage.description}
                </Text>
              )}
            </div>
          ))}
          {stages.length > 5 && (
            <Text style={{ marginLeft: 16, color: textMuted }}>
              ...还有 {stages.length - 5} 个阶段
            </Text>
          )}
        </div>
        {career.special_abilities && (
          <>
            <Divider style={{ margin: '12px 0', borderColor }} />
            <Text strong style={{ color: token.colorText }}>
              特殊能力：
            </Text>
            <Paragraph ellipsis={{ rows: 2 }} style={{ marginTop: 4, color: token.colorText }}>
              {career.special_abilities}
            </Paragraph>
          </>
        )}
      </Card>
    );
  };

  const tabItems = [
    {
      key: 'main',
      label: `主职业 (${mainCareers.length})`,
      children:
        mainCareers.length > 0 ? (
          <div>{mainCareers.map((career) => renderCareerCard(career, careers.indexOf(career)))}</div>
        ) : (
          <Empty description="还没有主职业" />
        ),
    },
    {
      key: 'sub',
      label: `副职业 (${subCareers.length})`,
      children:
        subCareers.length > 0 ? (
          <div>{subCareers.map((career) => renderCareerCard(career, careers.indexOf(career)))}</div>
        ) : (
          <Empty description="还没有副职业" />
        ),
    },
  ];

  return (
    <>
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: panelBg,
          borderRadius: 22,
          border: `1px solid ${borderColor}`,
        }}
      >
        <div
          style={{
            padding: '16px 16px 0 16px',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <Title level={3} style={{ margin: 0, color: token.colorText }}>
              <TrophyOutlined style={{ marginRight: 8 }} />
              职业管理
            </Title>
            <Space wrap>
              <Button
                type="dashed"
                icon={<ThunderboltOutlined />}
                onClick={handleAiGenerate}
                style={{
                  background: 'transparent',
                  color: token.colorText,
                  borderColor,
                }}
              >
                AI生成新职业
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openModal()}
                style={{
                  background: token.colorPrimary,
                  borderColor: token.colorPrimary,
                  boxShadow: 'none',
                }}
              >
                新增职业
              </Button>
            </Space>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '0 16px 16px 16px',
          }}
        >
          <Tabs items={tabItems} />
        </div>
      </div>

      <Modal
        title={editingIndex !== null ? '编辑职业' : '新增职业'}
        open={isModalOpen}
        onCancel={closeModal}
        footer={null}
        width={760}
        styles={{
          content: {
            background: token.colorBgElevated,
            border: `1px solid ${borderColor}`,
          },
          header: {
            background: token.colorBgElevated,
            borderBottom: `1px solid ${borderColor}`,
          },
          body: {
            background: token.colorBgElevated,
          },
        }}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item label="职业名称" name="name" rules={[{ required: true, message: '请输入职业名称' }]}>
                <Input placeholder="如：剑修、炼丹师" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="类型" name="type" rules={[{ required: true }]} initialValue="main">
                <Select
                  options={[
                    { label: '主职业', value: 'main' },
                    { label: '副职业', value: 'sub' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="职业描述" name="description">
            <TextArea rows={2} placeholder="描述这个职业..." />
          </Form.Item>

          <Form.Item label="职业分类" name="category">
            <Input placeholder="如：战斗系、生产系、辅助系" />
          </Form.Item>

          <Form.Item label="职业阶段" name="stages_editor" tooltip="每行一个阶段，格式：1. 阶段名 - 描述">
            <TextArea rows={8} placeholder={'示例：\n1. 炼气期 - 初窥门径\n2. 筑基期 - 根基稳固\n3. 金丹期 - 凝结金丹'} />
          </Form.Item>

          <Form.Item label="职业要求" name="requirements">
            <TextArea rows={2} placeholder="需要什么条件才能修炼..." />
          </Form.Item>

          <Form.Item label="特殊能力" name="special_abilities">
            <TextArea rows={2} placeholder="这个职业的特殊能力..." />
          </Form.Item>

          <Form.Item label="世界观规则" name="worldview_rules">
            <TextArea rows={2} placeholder="如何融入世界观..." />
          </Form.Item>

          <Form.Item label="来源" name="source" initialValue="manual">
            <Select
              options={[
                { label: '手动创建', value: 'manual' },
                { label: 'AI生成', value: 'ai' },
              ]}
            />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={closeModal}>取消</Button>
              <Button type="primary" htmlType="submit">
                {editingIndex !== null ? '更新' : '创建'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
