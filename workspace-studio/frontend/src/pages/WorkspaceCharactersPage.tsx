import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { useWorkspaceContext } from '../workspace-context';
import { cloneData, deleteCharacterAtIndex, syncWorkspaceDerivedFields, updateCharacterAtIndex } from '../workspace-utils';
import type { WorkspaceCharacter } from '../types';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

type CharacterTabKey = 'all' | 'character' | 'organization';

function characterCardStyle() {
  return {
    height: '100%',
    borderRadius: 18,
    boxShadow: '0 12px 28px rgba(17,24,39,0.08)',
  };
}

function normalizeTraits(value: WorkspaceCharacter['traits']): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return String(value)
    .split(/[，,、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOrganizationCharacter(
  item: WorkspaceCharacter,
  organization?: Record<string, any>,
): WorkspaceCharacter {
  return {
    ...item,
    power_level: organization?.power_level ?? item.power_level,
    location: organization?.location ?? item.location,
    motto: organization?.motto ?? item.motto,
    color: organization?.color ?? item.color,
  };
}

function buildCharacterPayload(values: any, createType: 'character' | 'organization'): WorkspaceCharacter {
  return {
    name: values.name,
    age: values.age ?? '',
    gender: values.gender ?? '',
    is_organization: createType === 'organization',
    role_type: values.role_type ?? (createType === 'organization' ? 'supporting' : 'supporting'),
    personality: values.personality ?? '',
    background: values.background ?? '',
    appearance: values.appearance ?? '',
    relationships: values.relationships ?? '',
    traits: values.traits_text
      ? values.traits_text
          .split(/[，,、\n]/)
          .map((item: string) => item.trim())
          .filter(Boolean)
      : [],
    organization_type: values.organization_type ?? '',
    organization_purpose: values.organization_purpose ?? '',
    organization_members: values.organization_members ?? '',
    avatar_url: values.avatar_url ?? '',
    main_career_id: values.main_career_id ?? '',
    main_career_stage: values.main_career_stage ?? null,
    sub_careers: values.sub_careers ?? '',
    power_level: values.power_level ?? null,
    location: values.location ?? '',
    motto: values.motto ?? '',
    color: values.color ?? '',
    created_at: values.created_at ?? '',
  };
}

export default function WorkspaceCharactersPage() {
  const { message } = App.useApp();
  const { data, saveData } = useWorkspaceContext();
  const [activeTab, setActiveTab] = useState<CharacterTabKey>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<'character' | 'organization'>('character');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form] = Form.useForm();

  const allCharacters = (data.characters || []) as WorkspaceCharacter[];
  const organizationDetailsMap = useMemo(
    () =>
      new Map(
        (data.organizations || []).map((item: any) => [item.character_name, item]),
      ),
    [data.organizations],
  );
  const displayList = useMemo(() => {
    if (activeTab === 'character') return allCharacters.filter((item) => !item.is_organization);
    if (activeTab === 'organization') {
      return allCharacters
        .filter((item) => item.is_organization)
        .map((item) => normalizeOrganizationCharacter(item, organizationDetailsMap.get(item.name)));
    }
    return allCharacters;
  }, [activeTab, allCharacters, organizationDetailsMap]);

  const openModal = (item?: WorkspaceCharacter, index?: number) => {
    if (item && index !== undefined) {
      setEditingIndex(index);
      setCreateType(item.is_organization ? 'organization' : 'character');
      const mergedItem = item.is_organization
        ? normalizeOrganizationCharacter(item, organizationDetailsMap.get(item.name))
        : item;
      form.setFieldsValue({
        ...mergedItem,
        traits_text: normalizeTraits(mergedItem.traits).join('，'),
      });
    } else {
      setEditingIndex(null);
      form.resetFields();
      form.setFieldsValue({ role_type: 'supporting', traits_text: '' });
    }
    setIsCreateModalOpen(true);
  };

  const closeModal = () => {
    setIsCreateModalOpen(false);
    setEditingIndex(null);
    form.resetFields();
  };

  const persistData = async (nextData: typeof data) => {
    await saveData(syncWorkspaceDerivedFields(nextData as any));
  };

  const handleSubmit = async (values: any) => {
    const nextData = cloneData(data);
    const payload = buildCharacterPayload(values, createType);

    if (editingIndex !== null) {
      const previous = nextData.characters[editingIndex] as WorkspaceCharacter;
      const merged = {
        ...previous,
        ...payload,
      };
      const updated = updateCharacterAtIndex(nextData as any, editingIndex, merged);
      try {
        await persistData(updated as any);
        message.success('角色已更新');
        closeModal();
      } catch {
        // saveData handles errors
      }
    } else {
      nextData.characters.push(payload as any);
      if (createType === 'organization') {
        nextData.organizations.push({
          character_name: payload.name,
          parent_org_name: '',
          power_level: values.power_level ?? null,
          member_count: 0,
          location: values.location ?? '',
          motto: values.motto ?? '',
          color: values.color ?? '',
        } as any);
      }
      try {
        await persistData(nextData);
        message.success(`${createType === 'character' ? '角色' : '组织'}已创建`);
        closeModal();
      } catch {
        // saveData handles errors
      }
    }
  };

  const handleDelete = (index: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '此操作只影响本地工作区，不会立即同步到 MuMu。',
      centered: true,
      onOk: async () => {
        closeModal();
        try {
          const nextData = deleteCharacterAtIndex(data as any, index);
          await persistData(nextData as any);
          message.success('已删除');
        } catch {
          // saveData handles errors
        }
      },
    });
  };

  const renderCharacterCard = (item: WorkspaceCharacter, index: number) => {
    const traits = normalizeTraits(item.traits);
    return (
      <Card
        key={`${item.name}-${index}`}
        hoverable
        style={characterCardStyle()}
        title={
          <Space>
            {item.is_organization ? <TeamOutlined /> : <UserOutlined />}
            <span>{item.name}</span>
          </Space>
        }
        extra={
          <Space>
            <Button size="small" onClick={() => openModal(item, index)}>
              编辑
            </Button>
            <Button size="small" danger onClick={() => handleDelete(index)}>
              删除
            </Button>
          </Space>
        }
      >
        <Space wrap style={{ marginBottom: 12 }}>
          {item.is_organization ? (
            <Tag color="blue">{item.organization_type || '组织'}</Tag>
          ) : (
            <Tag color="green">{item.role_type || '角色'}</Tag>
          )}
          {item.gender && <Tag>{item.gender}</Tag>}
          {item.age && <Tag>{item.age}</Tag>}
        </Space>

        {!item.is_organization && item.personality && (
          <>
            <Text strong>性格特点</Text>
            <Paragraph ellipsis={{ rows: 3 }} style={{ marginTop: 4 }}>
              {item.personality}
            </Paragraph>
          </>
        )}

        {!item.is_organization && item.background && (
          <>
            <Text strong>角色背景</Text>
            <Paragraph ellipsis={{ rows: 3 }} style={{ marginTop: 4 }}>
              {item.background}
            </Paragraph>
          </>
        )}

        {item.is_organization && item.organization_purpose && (
          <>
            <Text strong>组织目的</Text>
            <Paragraph ellipsis={{ rows: 3 }} style={{ marginTop: 4 }}>
              {item.organization_purpose}
            </Paragraph>
          </>
        )}

        {traits.length > 0 && (
          <Space wrap>
            {traits.slice(0, 6).map((trait) => (
              <Tag key={trait}>{trait}</Tag>
            ))}
          </Space>
        )}
      </Card>
    );
  };

  const tabItems = [
    {
      key: 'all',
      label: `全部 (${allCharacters.length})`,
      children:
        displayList.length > 0 ? (
          <Row gutter={[16, 16]}>
            {displayList.map((item) => (
              <Col key={`${item.name}-${allCharacters.indexOf(item)}`} xs={24} sm={12} xl={8}>
                {renderCharacterCard(item, allCharacters.indexOf(item))}
              </Col>
            ))}
          </Row>
        ) : (
          <Empty description="还没有角色或组织" />
        ),
    },
    {
      key: 'character',
      label: `角色 (${allCharacters.filter((item) => !item.is_organization).length})`,
      children:
        displayList.length > 0 ? (
          <Row gutter={[16, 16]}>
            {displayList.map((item) => (
              <Col key={`${item.name}-${allCharacters.indexOf(item)}`} xs={24} sm={12} xl={8}>
                {renderCharacterCard(item, allCharacters.indexOf(item))}
              </Col>
            ))}
          </Row>
        ) : (
          <Empty description="还没有角色" />
        ),
    },
    {
      key: 'organization',
      label: `组织 (${allCharacters.filter((item) => item.is_organization).length})`,
      children:
        displayList.length > 0 ? (
          <Row gutter={[16, 16]}>
            {displayList.map((item) => (
              <Col key={`${item.name}-${allCharacters.indexOf(item)}`} xs={24} sm={12} xl={8}>
                {renderCharacterCard(item, allCharacters.indexOf(item))}
              </Col>
            ))}
          </Row>
        ) : (
          <Empty description="还没有组织" />
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
        }}
      >
        <div style={{ padding: '16px 16px 0 16px', flexShrink: 0 }}>
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
            <Title level={3} style={{ margin: 0 }}>
              <TeamOutlined style={{ marginRight: 8 }} />
              角色管理
            </Title>
            <Space wrap>
              <Button onClick={() => { setCreateType('character'); openModal(); }} icon={<PlusOutlined />}>
                创建角色
              </Button>
              <Button type="primary" onClick={() => { setCreateType('organization'); openModal(); }} icon={<PlusOutlined />}>
                创建组织
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
          <Tabs activeKey={activeTab} items={tabItems} onChange={(key) => setActiveTab(key as CharacterTabKey)} />
        </div>
      </div>

      <Modal
        title={createType === 'character' ? (editingIndex !== null ? '编辑角色' : '创建角色') : editingIndex !== null ? '编辑组织' : '创建组织'}
        open={isCreateModalOpen}
        onCancel={closeModal}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          {createType === 'character' ? (
            <>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item label="角色名称" name="name" rules={[{ required: true, message: '请输入角色名称' }]}>
                    <Input placeholder="角色名称" />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="角色定位" name="role_type" initialValue="supporting">
                    <Select
                      options={[
                        { label: '主角', value: 'protagonist' },
                        { label: '配角', value: 'supporting' },
                        { label: '反派', value: 'antagonist' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col span={5}>
                  <Form.Item label="年龄" name="age">
                    <Input placeholder="如：25岁" />
                  </Form.Item>
                </Col>
                <Col span={5}>
                  <Form.Item label="性别" name="gender">
                    <Select
                      allowClear
                      options={[
                        { label: '男', value: '男' },
                        { label: '女', value: '女' },
                        { label: '其他', value: '其他' },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="性格特点" name="personality">
                    <TextArea rows={3} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="外貌描写" name="appearance">
                    <TextArea rows={3} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="角色背景" name="background">
                <TextArea rows={4} />
              </Form.Item>

              <Form.Item label="关键词 / 特征" name="traits_text">
                <Input placeholder="使用中文逗号分隔，如：社恐，嘴硬，冷静" />
              </Form.Item>
            </>
          ) : (
            <>
              <Row gutter={12}>
                <Col span={10}>
                  <Form.Item label="组织名称" name="name" rules={[{ required: true, message: '请输入组织名称' }]}>
                    <Input placeholder="组织名称" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="组织类型" name="organization_type">
                    <Input placeholder="如：门派、社团、公司" />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="势力等级" name="power_level">
                    <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="0-100" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="组织目的" name="organization_purpose">
                <TextArea rows={3} />
              </Form.Item>

              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="所在地" name="location">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="代表颜色" name="color">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="格言 / 口号" name="motto">
                <Input />
              </Form.Item>

              <Form.Item label="组织背景" name="background">
                <TextArea rows={4} />
              </Form.Item>
            </>
          )}

          <Form.Item style={{ marginBottom: 0 }}>
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
