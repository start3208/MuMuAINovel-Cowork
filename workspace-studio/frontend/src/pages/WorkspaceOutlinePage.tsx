import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  BranchesOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  PlusOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useWorkspaceContext } from '../workspace-context';
import { cloneData, updateOutlineAtIndex } from '../workspace-utils';

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

interface CharacterEntry {
  name: string;
  type: 'character' | 'organization';
}

interface SceneInfo {
  location: string;
  characters: string[];
  purpose: string;
}

interface OutlineStructureData {
  title?: string;
  summary?: string;
  content?: string;
  characters?: unknown[];
  scenes?: string[] | SceneInfo[];
  key_points?: string[];
  key_events?: string[];
  emotion?: string;
  goal?: string;
}

function parseOutlineStructure(structure?: string): OutlineStructureData {
  if (!structure) return {};
  try {
    return JSON.parse(structure) as OutlineStructureData;
  } catch {
    return {};
  }
}

function parseCharacterEntries(characters: unknown): CharacterEntry[] {
  if (!Array.isArray(characters)) return [];
  return characters
    .map((entry) => {
      if (typeof entry === 'string') {
        return { name: entry, type: 'character' as const };
      }
      if (typeof entry === 'object' && entry !== null && 'name' in entry) {
        return {
          name: String((entry as { name: string }).name),
          type: (entry as { type?: string }).type === 'organization' ? 'organization' : 'character',
        };
      }
      return null;
    })
    .filter((item): item is CharacterEntry => item !== null);
}

function getCharacterNames(entries: CharacterEntry[]): string[] {
  return entries.filter((entry) => entry.type === 'character').map((entry) => entry.name);
}

function getOrganizationNames(entries: CharacterEntry[]): string[] {
  return entries.filter((entry) => entry.type === 'organization').map((entry) => entry.name);
}

function getOutlinePreview(content: string, maxLength = 140) {
  const normalized = (content || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function scenesToEditorText(scenes: OutlineStructureData['scenes']): string {
  if (!Array.isArray(scenes)) return '';
  if (scenes.length === 0) return '';
  if (typeof scenes[0] === 'string') {
    return (scenes as string[]).join('\n');
  }
  return (scenes as SceneInfo[])
    .map((scene) => `${scene.location}|${(scene.characters || []).join('、')}|${scene.purpose}`)
    .join('\n');
}

function editorTextToScenes(text: string): string[] | SceneInfo[] | undefined {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;
  const hasStructured = lines.some((line) => line.includes('|'));
  if (!hasStructured) return lines;
  return lines
    .map((line) => {
      const parts = line.split('|');
      if (parts.length < 3) return null;
      return {
        location: parts[0].trim(),
        characters: parts[1]
          .split('、')
          .map((item) => item.trim())
          .filter(Boolean),
        purpose: parts[2].trim(),
      };
    })
    .filter((item): item is SceneInfo => item !== null);
}

function linesToList(text: string): string[] | undefined {
  const items = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export default function WorkspaceOutlinePage() {
  const { message, modal } = App.useApp();
  const { data, saveData } = useWorkspaceContext();
  const { token } = theme.useToken();
  const [searchKeyword, setSearchKeyword] = useState('');
  const [editVisible, setEditVisible] = useState(false);
  const [expansionVisible, setExpansionVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [selectedOutlineIndex, setSelectedOutlineIndex] = useState(0);
  const [form] = Form.useForm();

  const outlineMode = data.project.outline_mode || 'one-to-many';
  const outlines = useMemo(
    () => [...(data.outlines || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    [data.outlines],
  );

  const filteredOutlines = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return outlines;
    return outlines.filter((outline) => {
      const content = `${outline.order_index || ''} ${outline.title || ''} ${outline.content || ''}`.toLowerCase();
      return content.includes(keyword);
    });
  }, [outlines, searchKeyword]);

  const currentOutline = filteredOutlines[selectedOutlineIndex] || null;
  const currentOutlineStructure = parseOutlineStructure(currentOutline?.structure);
  const currentEntries = parseCharacterEntries(currentOutlineStructure.characters);
  const projectCharacters = (data.characters || [])
    .filter((item: any) => !item.is_organization)
    .map((item: any) => ({ label: item.name, value: item.name }));
  const projectOrganizations = (data.characters || [])
    .filter((item: any) => item.is_organization)
    .map((item: any) => ({ label: item.name, value: item.name }));

  const openEditModal = (outline: any, filteredIndex: number) => {
    const structureData = parseOutlineStructure(outline.structure);
    const entries = parseCharacterEntries(structureData.characters);
    setEditingIndex(outlines.indexOf(outline));
    setSelectedOutlineIndex(filteredIndex);
    form.setFieldsValue({
      title: outline.title,
      content: outline.content,
      characters: getCharacterNames(entries),
      organizations: getOrganizationNames(entries),
      scenes: scenesToEditorText(structureData.scenes),
      key_points: (structureData.key_points || []).join('\n'),
      emotion: structureData.emotion || '',
      goal: structureData.goal || '',
    });
    setEditVisible(true);
  };

  const closeEditModal = () => {
    setEditVisible(false);
    setEditingIndex(null);
    form.resetFields();
  };

  const handleSave = async (values: any) => {
    if (editingIndex === null) return;
    const current = outlines[editingIndex];
    const currentStructure = parseOutlineStructure(current.structure);
    const characters = (values.characters || []).map((name: string) => ({ name, type: 'character' as const }));
    const organizations = (values.organizations || []).map((name: string) => ({ name, type: 'organization' as const }));

    const nextStructure = {
      ...currentStructure,
      title: values.title,
      summary: values.content,
      characters: [...characters, ...organizations],
      scenes: editorTextToScenes(values.scenes || ''),
      key_points: linesToList(values.key_points || ''),
      emotion: values.emotion || undefined,
      goal: values.goal || undefined,
    };

    const nextData = updateOutlineAtIndex(data, editingIndex, {
      ...current,
      title: values.title,
      content: values.content,
      structure: JSON.stringify(nextStructure, null, 2),
    });

    try {
      await saveData(nextData);
      message.success('大纲已更新');
      closeEditModal();
    } catch {
      // saveData handles errors
    }
  };

  const handleDelete = async (outline: any) => {
    const relatedChapters = data.chapters.filter((chapter) => chapter.outline_title === outline.title);
    const content = relatedChapters.length > 0 ? `同时删除关联章节（${relatedChapters.length}章）` : '仅删除本地工作区中的大纲记录';
    modal.confirm({
      title: '确认删除大纲',
      content,
      icon: <ExclamationCircleOutlined />,
      centered: true,
      onOk: async () => {
        const nextData = cloneData(data);
        nextData.outlines = nextData.outlines.filter((item: any) => item !== outline);
        nextData.chapters = nextData.chapters.filter((chapter: any) => chapter.outline_title !== outline.title);
        try {
          await saveData(nextData);
          message.success('大纲已删除');
        } catch {
          // saveData handles errors
        }
      },
    });
  };

  const relatedChapters = currentOutline
    ? data.chapters.filter((chapter) => chapter.outline_title === currentOutline.title)
    : [];

  const expansionTabs = relatedChapters.map((chapter: any, index: number) => ({
    key: `${chapter.title}-${index}`,
    label: `${index + 1}. ${chapter.title}`,
    children: (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card size="small" title="基本信息">
          <Descriptions column={3} size="small">
            <Descriptions.Item label="章节号">{chapter.chapter_number}</Descriptions.Item>
            <Descriptions.Item label="状态">{chapter.status || 'draft'}</Descriptions.Item>
            <Descriptions.Item label="字数">{chapter.word_count || 0}</Descriptions.Item>
          </Descriptions>
        </Card>
        <Card size="small" title="情节概要">
          <Paragraph style={{ marginBottom: 0 }}>{chapter.summary || '暂无内容'}</Paragraph>
        </Card>
        <Card size="small" title="叙事目标">
          <Paragraph style={{ marginBottom: 0 }}>{parseOutlineStructure(currentOutline?.structure).goal || '未设置'}</Paragraph>
        </Card>
        <Card size="small" title="关键事件">
          {Array.isArray(currentOutlineStructure.key_points) && currentOutlineStructure.key_points.length > 0 ? (
            <List dataSource={currentOutlineStructure.key_points} renderItem={(item) => <List.Item>{item}</List.Item>} />
          ) : (
            <Empty description="暂无关键事件" />
          )}
        </Card>
        <Card size="small" title="涉及角色">
          <Space wrap>
            {getCharacterNames(currentEntries).length > 0 ? (
              getCharacterNames(currentEntries).map((name) => <Tag key={name}>{name}</Tag>)
            ) : (
              <Text type="secondary">暂无角色</Text>
            )}
          </Space>
        </Card>
      </Space>
    ),
  }));

  if (outlines.length === 0) {
    return <Empty description="当前工作区没有大纲" />;
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 0 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <Title level={3} style={{ margin: 0 }}>
                <FileTextOutlined style={{ marginRight: 8 }} />
                故事大纲
              </Title>
              {outlineMode === 'one-to-many' && <Tag color="green">细化模式（1→N）</Tag>}
            </div>
            <Space wrap>
              <Input
                prefix={<SearchOutlined />}
                placeholder="搜索大纲（序号/标题/内容）"
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                style={{ width: 280 }}
              />
              <Button icon={<PlusOutlined />} disabled>
                手动创建
              </Button>
              <Button type="primary" icon={<ThunderboltOutlined />} disabled>
                AI生成/续写大纲
              </Button>
              <Button icon={<BranchesOutlined />} disabled>
                批量展开为多章
              </Button>
            </Space>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          <List
            dataSource={filteredOutlines}
            renderItem={(item, filteredIndex) => {
              const structure = parseOutlineStructure(item.structure);
              const chapters = data.chapters.filter((chapter) => chapter.outline_title === item.title);
              return (
                <List.Item style={{ paddingInline: 0 }}>
                  <Card
                    className="studio-card"
                    style={{ width: '100%' }}
                    title={
                      <Space>
                        <span style={{ color: token.colorPrimary, fontWeight: 700 }}>第{item.order_index}卷</span>
                        <span>{item.title}</span>
                        {chapters.length > 0 && (
                          <Tag color="green" icon={<CheckCircleOutlined />}>
                            已展开
                          </Tag>
                        )}
                      </Space>
                    }
                  >
                    <Card
                      size="small"
                      title={
                        <Space>
                          <FileTextOutlined />
                          大纲内容
                        </Space>
                      }
                      extra={<Button type="link">展开</Button>}
                      style={{ marginBottom: 16 }}
                    >
                      <Paragraph style={{ marginBottom: 0 }}>{getOutlinePreview(item.content || '暂无内容')}</Paragraph>
                    </Card>

                    <Space wrap style={{ marginBottom: 12 }}>
                      {structure.emotion && <Tag color="magenta">{structure.emotion}</Tag>}
                      {structure.goal && <Tag color="cyan">{structure.goal}</Tag>}
                      {getCharacterNames(parseCharacterEntries(structure.characters)).length > 0 && (
                        <Tag color="blue">角色 {getCharacterNames(parseCharacterEntries(structure.characters)).length}</Tag>
                      )}
                      {getOrganizationNames(parseCharacterEntries(structure.characters)).length > 0 && (
                        <Tag color="purple">组织 {getOrganizationNames(parseCharacterEntries(structure.characters)).length}</Tag>
                      )}
                      {Array.isArray(structure.scenes) && <Tag color="gold">场景 {structure.scenes.length}</Tag>}
                    </Space>

                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 12,
                        borderTop: `1px solid ${token.colorBorderSecondary}`,
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 8,
                      }}
                    >
                      <Button
                        icon={<BranchesOutlined />}
                        onClick={() => {
                          setSelectedOutlineIndex(filteredIndex);
                          setExpansionVisible(true);
                        }}
                      >
                        展开
                      </Button>
                      <Button icon={<EditOutlined />} onClick={() => openEditModal(item, filteredIndex)}>
                        编辑
                      </Button>
                      <Popconfirm title="确定删除这条大纲吗？" onConfirm={() => handleDelete(item)}>
                        <Button danger icon={<DeleteOutlined />}>
                          删除
                        </Button>
                      </Popconfirm>
                    </div>
                  </Card>
                </List.Item>
              );
            }}
          />
        </div>
      </div>

      <Modal title="编辑大纲" open={editVisible} onCancel={closeEditModal} footer={null} width={880}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item label="标题" name="title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="内容" name="content" rules={[{ required: true }]}>
            <TextArea rows={5} />
          </Form.Item>
          <Form.Item label="涉及角色" name="characters">
            <Select mode="tags" options={projectCharacters} />
          </Form.Item>
          <Form.Item label="涉及组织" name="organizations">
            <Select mode="tags" options={projectOrganizations} />
          </Form.Item>
          <Form.Item label="场景信息" name="scenes">
            <TextArea rows={4} placeholder="每行一个场景，详细格式：地点|角色们|目的" />
          </Form.Item>
          <Form.Item label="情节要点" name="key_points">
            <TextArea rows={4} placeholder="每行一个情节要点" />
          </Form.Item>
          <Form.Item label="情感基调" name="emotion">
            <Input />
          </Form.Item>
          <Form.Item label="叙事目标" name="goal">
            <Input />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={closeEditModal}>取消</Button>
              <Button type="primary" htmlType="submit">
                更新
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={currentOutline ? `《${currentOutline.title}》展开信息` : '展开信息'}
        open={expansionVisible}
        onCancel={() => setExpansionVisible(false)}
        footer={null}
        width={980}
      >
        {currentOutline ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap>
              <Tag color="blue">大纲: {currentOutline.title}</Tag>
              <Tag color="green">章节数: {relatedChapters.length}</Tag>
              {relatedChapters.length > 0 && <Tag color="gold">已创建章节</Tag>}
            </Space>
            {expansionTabs.length > 0 ? (
              <Tabs items={expansionTabs} />
            ) : (
              <Empty description="当前大纲还没有关联章节" />
            )}
          </Space>
        ) : null}
      </Modal>
    </>
  );
}
