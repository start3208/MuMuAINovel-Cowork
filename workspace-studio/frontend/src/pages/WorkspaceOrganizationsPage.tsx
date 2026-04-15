import { useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  theme,
} from 'antd';
import { BankOutlined, DeleteOutlined, EditOutlined, PlusOutlined, UnorderedListOutlined, UserOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useWorkspaceContext } from '../workspace-context';
import {
  cloneData,
  deleteCharacterAtIndex,
  syncWorkspaceDerivedFields,
  updateCharacterAtIndex,
  updateOrganizationMembers,
  updateOrganizations,
} from '../workspace-utils';
import type { WorkspaceCharacter } from '../types';

interface LocalOrganization {
  _index: number;
  character_name: string;
  parent_org_name?: string;
  power_level?: number;
  member_count?: number;
  location?: string;
  motto?: string;
  color?: string;
}

interface LocalOrganizationMember {
  _index: number;
  organization_name: string;
  character_name: string;
  position: string;
  rank?: number;
  status?: string;
  joined_at?: string;
  loyalty?: number;
  contribution?: number;
  notes?: string;
}

function normalizeOrganizations(data: any[]): LocalOrganization[] {
  return data.map((item, index) => ({
    _index: index,
    character_name: item.character_name,
    parent_org_name: item.parent_org_name,
    power_level: item.power_level,
    member_count: item.member_count,
    location: item.location,
    motto: item.motto,
    color: item.color,
  }));
}

function normalizeMembers(data: any[]): LocalOrganizationMember[] {
  return data.map((item, index) => ({
    _index: index,
    organization_name: item.organization_name,
    character_name: item.character_name,
    position: item.position,
    rank: item.rank,
    status: item.status,
    joined_at: item.joined_at,
    loyalty: item.loyalty,
    contribution: item.contribution,
    notes: item.notes,
  }));
}

function getStatusColor(status?: string) {
  const colors: Record<string, string> = {
    active: 'green',
    retired: 'default',
    expelled: 'red',
    deceased: 'black',
  };
  return colors[status || 'active'] || 'default';
}

function getStatusText(status?: string) {
  const texts: Record<string, string> = {
    active: '在职',
    retired: '退休',
    expelled: '除名',
    deceased: '已故',
  };
  return texts[status || 'active'] || status || 'active';
}

const { TextArea } = Input;

export default function WorkspaceOrganizationsPage() {
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const { data, saveData } = useWorkspaceContext();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [orgListVisible, setOrgListVisible] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [isEditMemberModalOpen, setIsEditMemberModalOpen] = useState(false);
  const [isEditOrgModalOpen, setIsEditOrgModalOpen] = useState(false);
  const [editingMemberIndex, setEditingMemberIndex] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [addMemberForm] = Form.useForm();
  const [editMemberForm] = Form.useForm();
  const [editOrgForm] = Form.useForm();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const organizations = useMemo(() => normalizeOrganizations(data.organizations || []), [data.organizations]);
  const members = useMemo(() => normalizeMembers(data.organization_members || []), [data.organization_members]);
  const organizationCharacters = useMemo(
    () => (data.characters as WorkspaceCharacter[]).filter((item) => item.is_organization),
    [data.characters],
  );
  const currentOrg = organizations[selectedIndex];
  const currentOrgCharacter = currentOrg
    ? organizationCharacters.find((item) => item.name === currentOrg.character_name)
    : undefined;
  const currentMembers = useMemo(
    () => (currentOrg ? members.filter((member) => member.organization_name === currentOrg.character_name) : []),
    [currentOrg, members],
  );
  const currentOrgFormValues = useMemo(() => {
    if (!currentOrg || !currentOrgCharacter) return null;
    return {
      name: currentOrgCharacter.name,
      organization_type: currentOrgCharacter.organization_type,
      organization_purpose: currentOrgCharacter.organization_purpose,
      background: currentOrgCharacter.background,
      power_level: currentOrg.power_level ?? currentOrgCharacter.power_level,
      location: currentOrg.location ?? currentOrgCharacter.location,
      motto: currentOrg.motto ?? currentOrgCharacter.motto,
      color: currentOrg.color ?? currentOrgCharacter.color,
    };
  }, [currentOrg, currentOrgCharacter]);

  const availableCharacters = useMemo(() => {
    return (data.characters as WorkspaceCharacter[])
      .filter((item) => !item.is_organization)
      .filter((item) => !currentMembers.some((member) => member.character_name === item.name));
  }, [data.characters, currentMembers]);

  useEffect(() => {
    if (!isEditOrgModalOpen || !currentOrgFormValues) return;
    editOrgForm.setFieldsValue(currentOrgFormValues);
  }, [isEditOrgModalOpen, currentOrgFormValues, editOrgForm]);

  const persist = async (nextData: typeof data) => {
    await saveData(syncWorkspaceDerivedFields(nextData as any));
  };

  const syncMemberCount = (nextData: typeof data, organizationName: string) => {
    const count = nextData.organization_members.filter((item: any) => item.organization_name === organizationName).length;
    nextData.organizations = nextData.organizations.map((item: any) =>
      item.character_name === organizationName ? { ...item, member_count: count } : item,
    );
  };

  const openEditOrgModal = () => {
    if (!currentOrgFormValues) return;
    editOrgForm.setFieldsValue(currentOrgFormValues);
    setIsEditOrgModalOpen(true);
  };

  const handleUpdateOrg = async (values: any) => {
    if (!currentOrg || !currentOrgCharacter) return;
    const characterIndex = (data.characters as WorkspaceCharacter[]).findIndex((item) => item.name === currentOrgCharacter.name);
    if (characterIndex < 0) return;
    const nextCharacter: WorkspaceCharacter = {
      ...currentOrgCharacter,
      ...values,
      is_organization: true,
      power_level: values.power_level,
      location: values.location,
      motto: values.motto,
      color: values.color,
    };

    try {
      const nextData = updateCharacterAtIndex(data as any, characterIndex, nextCharacter);
      await persist(updateOrganizations(nextData as any, nextData.organizations as any) as any);
      message.success('组织信息更新成功');
      setIsEditOrgModalOpen(false);
    } catch {
      // saveData handles errors
    }
  };

  const handleDeleteOrg = () => {
    if (!currentOrg || !currentOrgCharacter) return;
    modal.confirm({
      title: '确认删除组织',
      content: '会同时删除组织角色卡、组织详情与成员映射，仅影响本地工作区。',
      centered: true,
      onOk: async () => {
        const characterIndex = (data.characters as WorkspaceCharacter[]).findIndex((item) => item.name === currentOrgCharacter.name);
        if (characterIndex < 0) return;
        try {
          const nextData = deleteCharacterAtIndex(data as any, characterIndex);
          await persist(nextData as any);
          message.success('组织删除成功');
          setSelectedIndex(0);
        } catch {
          // saveData handles errors
        }
      },
    });
  };

  const handleAddMember = async (values: any) => {
    if (!currentOrg) return;
    const selectedCharacter = (data.characters as WorkspaceCharacter[]).find((item) => item.name === values.character_name);
    if (!selectedCharacter) return;
    const nextData = cloneData(data);
    nextData.organization_members.push({
      organization_name: currentOrg.character_name,
      character_name: selectedCharacter.name,
      position: values.position,
      rank: values.rank,
      status: values.status,
      joined_at: values.joined_at,
      loyalty: values.loyalty,
      contribution: values.contribution,
      notes: values.notes,
    });
    syncMemberCount(nextData, currentOrg.character_name);
    try {
      await persist(updateOrganizationMembers(nextData as any, nextData.organization_members as any) as any);
      message.success('成员添加成功');
      setIsAddMemberModalOpen(false);
      addMemberForm.resetFields();
    } catch {
      // saveData handles errors
    }
  };

  const openEditMember = (member: LocalOrganizationMember) => {
    setEditingMemberIndex(member._index);
    editMemberForm.setFieldsValue(member);
    setIsEditMemberModalOpen(true);
  };

  const handleUpdateMember = async (values: any) => {
    if (editingMemberIndex === null) return;
    const nextData = cloneData(data);
    nextData.organization_members = nextData.organization_members.map((item: any, index: number) =>
      index === editingMemberIndex
        ? {
            ...item,
            ...values,
          }
        : item,
    );
    if (currentOrg) {
      syncMemberCount(nextData, currentOrg.character_name);
    }
    try {
      await persist(updateOrganizationMembers(nextData as any, nextData.organization_members as any) as any);
      message.success('成员信息更新成功');
      setIsEditMemberModalOpen(false);
      setEditingMemberIndex(null);
      editMemberForm.resetFields();
    } catch {
      // saveData handles errors
    }
  };

  const handleRemoveMember = (member: LocalOrganizationMember) => {
    if (!currentOrg) return;
    modal.confirm({
      title: '确认移除成员',
      content: '仅影响本地工作区中的组织成员列表。',
      centered: true,
      onOk: async () => {
        const nextData = cloneData(data);
        nextData.organization_members = nextData.organization_members.filter((_: any, index: number) => index !== member._index);
        syncMemberCount(nextData, currentOrg.character_name);
        try {
          await persist(updateOrganizationMembers(nextData as any, nextData.organization_members as any) as any);
          message.success('成员移除成功');
        } catch {
          // saveData handles errors
        }
      },
    });
  };

  const memberColumns: ColumnsType<LocalOrganizationMember> = [
    {
      title: '姓名',
      dataIndex: 'character_name',
      key: 'name',
      render: (name: string) => (
        <Space>
          <UserOutlined />
          <span>{name}</span>
        </Space>
      ),
    },
    {
      title: '职位',
      dataIndex: 'position',
      key: 'position',
      render: (position: string, record) => <Tag color="blue">{position} {!isMobile && `(级别 ${record.rank ?? 0})`}</Tag>,
    },
    {
      title: '忠诚度',
      dataIndex: 'loyalty',
      key: 'loyalty',
      render: (loyalty?: number) => (
        <span style={{ color: (loyalty || 0) >= 70 ? 'green' : (loyalty || 0) >= 40 ? 'orange' : 'red' }}>
          {loyalty ?? 0}%
        </span>
      ),
    },
    {
      title: '贡献度',
      dataIndex: 'contribution',
      key: 'contribution',
      render: (contribution?: number) => `${contribution ?? 0}%`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status?: string) => <Tag color={getStatusColor(status)}>{getStatusText(status)}</Tag>,
    },
    {
      title: '加入时间',
      dataIndex: 'joined_at',
      key: 'joined_at',
      render: (time?: string) => time || '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space size={isMobile ? 0 : 'small'}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditMember(record)}
            style={isMobile ? { padding: 4 } : undefined}
          >
            {isMobile ? '' : '编辑'}
          </Button>
          <Button
            type="link"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleRemoveMember(record)}
            style={isMobile ? { padding: 4 } : undefined}
          >
            {isMobile ? '' : '移除'}
          </Button>
        </Space>
      ),
    },
  ];

  if (organizations.length === 0) {
    return <Empty description="当前工作区没有组织" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 0', marginBottom: 16, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <h2 style={{ margin: 0, fontSize: 24 }}>
          <BankOutlined style={{ marginRight: 8 }} />
          组织管理
        </h2>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: isMobile ? 0 : 16,
          flexDirection: isMobile ? 'column' : 'row',
          overflow: 'hidden',
        }}
      >
        {!isMobile && (
          <Card
            title={`组织列表 (${organizations.length})`}
            style={{ width: 300, height: '100%', overflow: 'hidden' }}
            bodyStyle={{ padding: 0, height: 'calc(100% - 57px)', overflow: 'auto' }}
          >
            <Space direction="vertical" style={{ width: '100%', padding: 12 }}>
              {organizations.map((organization, index) => (
                <Card
                  key={`${organization.character_name}-${index}`}
                  size="small"
                  hoverable
                  style={{
                    cursor: 'pointer',
                    border:
                      currentOrg && currentOrg.character_name === organization.character_name
                        ? `2px solid ${token.colorPrimary}`
                        : `1px solid ${token.colorBorder}`,
                    background:
                      currentOrg && currentOrg.character_name === organization.character_name
                        ? token.colorPrimaryBg
                        : 'transparent',
                  }}
                  onClick={() => setSelectedIndex(index)}
                >
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <strong style={{ fontSize: 14 }}>{organization.character_name}</strong>
                    <Tag color="blue">
                      {organizationCharacters.find((item) => item.name === organization.character_name)?.organization_type || '组织'}
                    </Tag>
                    <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                      成员: {currentOrg && currentOrg.character_name === organization.character_name ? currentMembers.length : members.filter((member) => member.organization_name === organization.character_name).length}
                      {' | '}
                      势力: {organization.power_level ?? 0}
                    </div>
                  </Space>
                </Card>
              ))}
            </Space>
          </Card>
        )}

        {isMobile && (
          <Drawer title="组织列表" placement="left" onClose={() => setOrgListVisible(false)} open={orgListVisible} width="85%" styles={{ body: { padding: 0 } }}>
            <Space direction="vertical" style={{ width: '100%', padding: 12 }}>
              {organizations.map((organization, index) => (
                <Card
                  key={`${organization.character_name}-${index}`}
                  size="small"
                  hoverable
                  style={{
                    cursor: 'pointer',
                    border:
                      currentOrg && currentOrg.character_name === organization.character_name
                        ? `2px solid ${token.colorPrimary}`
                        : `1px solid ${token.colorBorder}`,
                    background:
                      currentOrg && currentOrg.character_name === organization.character_name
                        ? token.colorPrimaryBg
                        : 'transparent',
                  }}
                  onClick={() => {
                    setSelectedIndex(index);
                    setOrgListVisible(false);
                  }}
                >
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <strong style={{ fontSize: 14 }}>{organization.character_name}</strong>
                    <Tag color="blue">
                      {organizationCharacters.find((item) => item.name === organization.character_name)?.organization_type || '组织'}
                    </Tag>
                  </Space>
                </Card>
              ))}
            </Space>
          </Drawer>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {!currentOrg || !currentOrgCharacter ? (
            <Card style={{ height: '100%' }}>
              <div style={{ textAlign: 'center', padding: '100px 20px', color: token.colorTextTertiary }}>
                {isMobile && organizations.length > 0 && (
                  <Button type="primary" icon={<UnorderedListOutlined />} onClick={() => setOrgListVisible(true)} style={{ marginBottom: 20 }}>
                    选择组织
                  </Button>
                )}
                <div>请选择一个组织查看详情</div>
              </div>
            </Card>
          ) : (
            <>
              {isMobile && (
                <Card size="small" style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space>
                      <BankOutlined />
                      <span style={{ fontSize: 14, fontWeight: 600 }}>组织管理</span>
                      <Tag color="blue">{currentOrgCharacter.name}</Tag>
                    </Space>
                    <Button icon={<UnorderedListOutlined />} onClick={() => setOrgListVisible(true)} size="small">
                      列表
                    </Button>
                  </div>
                </Card>
              )}

              <div style={{ flex: 1, display: 'flex', gap: isMobile ? 0 : 16, overflow: 'hidden' }}>
                <Card style={{ flex: 1, overflow: 'auto' }} bodyStyle={{ padding: isMobile ? 12 : 24 }}>
                  <Space direction="vertical" style={{ width: '100%' }} size={isMobile ? 'middle' : 'large'}>
                    <Card
                      title="组织详情"
                      size="small"
                      extra={
                        <Button type="link" size="small" icon={<EditOutlined />} onClick={openEditOrgModal}>
                          编辑
                        </Button>
                      }
                    >
                      <Descriptions column={isMobile ? 1 : 2} size="small">
                        <Descriptions.Item label="组织名称">{currentOrgCharacter.name}</Descriptions.Item>
                        <Descriptions.Item label="类型">{currentOrgCharacter.organization_type || '-'}</Descriptions.Item>
                        <Descriptions.Item label="成员数量">{currentMembers.length}</Descriptions.Item>
                        <Descriptions.Item label="势力等级">
                          <Tag color={(currentOrg.power_level || 0) >= 70 ? 'red' : (currentOrg.power_level || 0) >= 50 ? 'orange' : 'default'}>
                            {currentOrg.power_level ?? 0}
                          </Tag>
                        </Descriptions.Item>
                        {currentOrg.location && (
                          <Descriptions.Item label="所在地" span={isMobile ? 1 : 2}>
                            {currentOrg.location}
                          </Descriptions.Item>
                        )}
                        {currentOrg.color && <Descriptions.Item label="代表颜色">{currentOrg.color}</Descriptions.Item>}
                        {currentOrg.motto && (
                          <Descriptions.Item label="格言/口号" span={isMobile ? 1 : 2}>
                            {currentOrg.motto}
                          </Descriptions.Item>
                        )}
                        <Descriptions.Item label="组织目的" span={isMobile ? 1 : 2}>
                          {currentOrgCharacter.organization_purpose || currentOrgCharacter.background || '-'}
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>

                    <Card
                      title={`组织成员 (${currentMembers.length})`}
                      extra={
                        <Button
                          type="primary"
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={() => setIsAddMemberModalOpen(true)}
                          disabled={availableCharacters.length === 0}
                        >
                          添加成员
                        </Button>
                      }
                    >
                      <Table
                        columns={memberColumns}
                        dataSource={currentMembers}
                        rowKey={(record) => `${record.organization_name}-${record.character_name}-${record._index}`}
                        pagination={currentMembers.length > 5 ? { defaultPageSize: 5, showSizeChanger: true, position: ['bottomCenter'] } : false}
                        size="small"
                        scroll={{ x: isMobile ? 'max-content' : undefined, y: currentMembers.length > 10 ? 500 : undefined }}
                      />
                    </Card>

                    <Space>
                      <Button danger icon={<DeleteOutlined />} onClick={handleDeleteOrg}>
                        删除组织
                      </Button>
                    </Space>
                  </Space>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        title="添加组织成员"
        open={isAddMemberModalOpen}
        onCancel={() => {
          setIsAddMemberModalOpen(false);
          addMemberForm.resetFields();
        }}
        footer={null}
        centered={!isMobile}
        width={isMobile ? '100%' : 520}
        style={isMobile ? { top: 0, paddingBottom: 0, maxWidth: '100vw' } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 110px)', overflowY: 'auto' } } : undefined}
      >
        <Form form={addMemberForm} layout="vertical" onFinish={handleAddMember}>
          <Form.Item name="character_name" label="选择角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              placeholder="选择要加入的角色"
              showSearch
              optionFilterProp="label"
              options={availableCharacters.map((item) => ({ label: item.name, value: item.name }))}
            />
          </Form.Item>
          <Form.Item name="position" label="职位" rules={[{ required: true, message: '请输入职位' }]}>
            <Input placeholder="如：掌门、长老、弟子" />
          </Form.Item>
          <Form.Item name="rank" label="职位等级" initialValue={5}>
            <InputNumber min={0} max={10} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="loyalty" label="初始忠诚度" initialValue={50}>
            <InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>
          <Form.Item name="contribution" label="贡献度" initialValue={0}>
            <InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="active">
            <Select>
              <Select.Option value="active">在职</Select.Option>
              <Select.Option value="retired">退休</Select.Option>
              <Select.Option value="expelled">除名</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="joined_at" label="加入时间">
            <Input placeholder="如：三年前、建立之初" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setIsAddMemberModalOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit">
                添加
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑成员信息"
        open={isEditMemberModalOpen}
        onCancel={() => {
          setIsEditMemberModalOpen(false);
          editMemberForm.resetFields();
          setEditingMemberIndex(null);
        }}
        footer={null}
        centered
        width={isMobile ? '90%' : 520}
      >
        <Form form={editMemberForm} layout="vertical" onFinish={handleUpdateMember}>
          <Form.Item name="position" label="职位" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="rank" label="职位等级">
            <InputNumber min={0} max={10} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="loyalty" label="忠诚度">
            <InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>
          <Form.Item name="contribution" label="贡献度">
            <InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select>
              <Select.Option value="active">在职</Select.Option>
              <Select.Option value="retired">退休</Select.Option>
              <Select.Option value="expelled">除名</Select.Option>
              <Select.Option value="deceased">已故</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="joined_at" label="加入时间">
            <Input />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setIsEditMemberModalOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑组织信息"
        open={isEditOrgModalOpen}
        onCancel={() => {
          setIsEditOrgModalOpen(false);
          editOrgForm.resetFields();
        }}
        footer={null}
        width={720}
      >
        <Form form={editOrgForm} layout="vertical" onFinish={handleUpdateOrg}>
          <Form.Item name="name" label="组织名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="organization_type" label="组织类型">
            <Input />
          </Form.Item>
          <Form.Item name="organization_purpose" label="组织目的">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item name="background" label="组织背景">
            <TextArea rows={4} />
          </Form.Item>
          <Form.Item name="location" label="所在地">
            <Input />
          </Form.Item>
          <Form.Item name="power_level" label="势力等级">
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="motto" label="格言/口号">
            <Input />
          </Form.Item>
          <Form.Item name="color" label="代表颜色">
            <Input />
          </Form.Item>
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setIsEditOrgModalOpen(false)}>取消</Button>
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
