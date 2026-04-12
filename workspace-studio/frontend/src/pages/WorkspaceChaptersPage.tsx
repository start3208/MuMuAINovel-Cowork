import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  BookOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  FormOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useWorkspaceContext } from '../workspace-context';
import { cloneData, updateChapterAtIndex } from '../workspace-utils';

const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

export default function WorkspaceChaptersPage() {
  const { message, modal } = App.useApp();
  const { data, saveData } = useWorkspaceContext();
  const [editorVisible, setEditorVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [chapterPage, setChapterPage] = useState(1);
  const [chapterPageSize, setChapterPageSize] = useState(10);
  const [form] = Form.useForm();

  const chapters = useMemo(
    () => [...(data.chapters || [])].sort((a, b) => (a.chapter_number || 0) - (b.chapter_number || 0)),
    [data.chapters],
  );

  const filteredChapters = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return chapters;
    return chapters.filter((chapter) => {
      const haystack = `${chapter.chapter_number || ''} ${chapter.title || ''} ${chapter.summary || ''} ${chapter.content || ''}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [chapters, searchKeyword]);

  const pagedChapters = useMemo(() => {
    const start = (chapterPage - 1) * chapterPageSize;
    return filteredChapters.slice(start, start + chapterPageSize);
  }, [filteredChapters, chapterPage, chapterPageSize]);

  const previewChapter = previewIndex !== null ? chapters[previewIndex] : null;

  const openEditor = (chapter?: any, index?: number) => {
    if (chapter && index !== undefined) {
      setEditingIndex(index);
      form.setFieldsValue(chapter);
    } else {
      setEditingIndex(null);
      form.resetFields();
      form.setFieldsValue({
        chapter_number: chapters.length + 1,
        status: 'draft',
      });
    }
    setEditorVisible(true);
  };

  const closeEditor = () => {
    setEditorVisible(false);
    setEditingIndex(null);
    form.resetFields();
  };

  const handleSave = async (values: any) => {
    const nextData = cloneData(data);
    if (editingIndex !== null) {
      const chapter = chapters[editingIndex];
      const absoluteIndex = nextData.chapters.indexOf(chapter);
      const nextChapter = {
        ...chapter,
        ...values,
        word_count: (values.content || '').length,
      };
      const updated = updateChapterAtIndex(nextData, absoluteIndex, nextChapter as any);
      updated.project.current_words = updated.chapters.reduce((sum: number, item: any) => sum + (item.word_count || 0), 0);
      try {
        await saveData(updated);
        message.success('章节已更新');
        closeEditor();
      } catch {}
    } else {
      nextData.chapters.push({
        ...values,
        word_count: (values.content || '').length,
      });
      nextData.project.current_words = nextData.chapters.reduce((sum: number, item: any) => sum + (item.word_count || 0), 0);
      try {
        await saveData(nextData);
        message.success('章节已创建');
        closeEditor();
      } catch {}
    }
  };

  const handleDelete = async (chapter: any) => {
    const nextData = cloneData(data);
    nextData.chapters = nextData.chapters.filter((item: any) => item !== chapter);
    nextData.project.current_words = nextData.chapters.reduce((sum: number, item: any) => sum + (item.word_count || 0), 0);
    try {
      await saveData(nextData);
      message.success('章节已删除');
    } catch {}
  };

  if (chapters.length === 0) {
    return (
      <Card className="studio-card">
        <Empty description="当前工作区没有章节" />
      </Card>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 0 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Title level={3} style={{ margin: 0 }}>
              <BookOutlined style={{ marginRight: 8 }} />
              章节管理
            </Title>
            <Space wrap>
              <Input
                placeholder="搜索章节（序号/标题/摘要/内容）"
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                style={{ width: 280 }}
              />
              <Button icon={<ThunderboltOutlined />} disabled>
                AI创作（后续接入）
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
                新建章节
              </Button>
            </Space>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          <List
            dataSource={pagedChapters}
            renderItem={(chapter) => (
              <List.Item style={{ paddingInline: 0 }}>
                <Card
                  className="studio-card"
                  style={{ width: '100%' }}
                  title={
                    <Space>
                      <Tag color="blue">第{chapter.chapter_number}章</Tag>
                      <span>{chapter.title}</span>
                      {chapter.outline_title && <Tag>{chapter.outline_title}</Tag>}
                    </Space>
                  }
                  extra={
                    <Space>
                      <Button icon={<EyeOutlined />} size="small" onClick={() => setPreviewIndex(chapters.indexOf(chapter))}>
                        预览
                      </Button>
                      <Button icon={<FormOutlined />} size="small" onClick={() => openEditor(chapter, chapters.indexOf(chapter))}>
                        编辑
                      </Button>
                      <Popconfirm title="确定删除章节吗？" onConfirm={() => handleDelete(chapter)}>
                        <Button danger icon={<DeleteOutlined />} size="small">
                          删除
                        </Button>
                      </Popconfirm>
                    </Space>
                  }
                >
                  <Space wrap style={{ marginBottom: 12 }}>
                    <Tag color={chapter.content ? 'green' : 'default'}>{chapter.status || 'draft'}</Tag>
                    <Tag>{chapter.word_count || 0}字</Tag>
                  </Space>
                  {chapter.summary && (
                    <>
                      <Text strong>章节摘要</Text>
                      <Paragraph style={{ marginTop: 8 }}>{chapter.summary}</Paragraph>
                    </>
                  )}
                  {chapter.content && (
                    <>
                      <Text strong>正文预览</Text>
                      <Paragraph ellipsis={{ rows: 4 }} style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                        {chapter.content}
                      </Paragraph>
                    </>
                  )}
                </Card>
              </List.Item>
            )}
          />
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'flex-end' }}>
          <Pagination
            current={chapterPage}
            pageSize={chapterPageSize}
            total={filteredChapters.length}
            showSizeChanger
            pageSizeOptions={['10', '20', '50']}
            onChange={(page, size) => {
              setChapterPage(page);
              if (size !== chapterPageSize) {
                setChapterPageSize(size);
                setChapterPage(1);
              }
            }}
            showTotal={(total) => `共 ${total} 章`}
          />
        </div>
      </div>

      <Modal
        title={editingIndex !== null ? '编辑章节' : '新建章节'}
        open={editorVisible}
        onCancel={closeEditor}
        footer={null}
        width={920}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Space style={{ width: '100%' }} size={16} align="start">
            <Form.Item name="chapter_number" label="章节号" style={{ width: 120 }}>
              <Input />
            </Form.Item>
            <Form.Item name="status" label="状态" style={{ width: 180 }}>
              <Select
                options={[
                  { label: 'draft', value: 'draft' },
                  { label: 'pending', value: 'pending' },
                  { label: 'completed', value: 'completed' },
                ]}
              />
            </Form.Item>
            <Form.Item name="outline_title" label="关联大纲" style={{ flex: 1 }}>
              <Select
                allowClear
                options={(data.outlines || []).map((outline: any) => ({ label: outline.title, value: outline.title }))}
              />
            </Form.Item>
          </Space>
          <Form.Item name="title" label="章节标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="summary" label="章节摘要">
            <TextArea rows={5} />
          </Form.Item>
          <Form.Item name="content" label="章节正文">
            <TextArea rows={18} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={closeEditor}>取消</Button>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={previewChapter ? `第${previewChapter.chapter_number}章：${previewChapter.title}` : '章节预览'}
        open={previewVisible || previewIndex !== null}
        onCancel={() => {
          setPreviewVisible(false);
          setPreviewIndex(null);
        }}
        footer={null}
        width={960}
      >
        {previewChapter && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap>
              <Tag color={previewChapter.content ? 'green' : 'default'}>{previewChapter.status || 'draft'}</Tag>
              <Tag>{previewChapter.word_count || 0}字</Tag>
              {previewChapter.outline_title && <Tag>{previewChapter.outline_title}</Tag>}
            </Space>
            {previewChapter.summary && (
              <Card size="small" title="章节摘要">
                <Paragraph style={{ marginBottom: 0 }}>{previewChapter.summary}</Paragraph>
              </Card>
            )}
            <Card size="small" title="章节正文">
              <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{previewChapter.content || '暂无内容'}</Paragraph>
            </Card>
          </Space>
        )}
      </Modal>
    </>
  );
}
