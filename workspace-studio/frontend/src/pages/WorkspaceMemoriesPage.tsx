import { useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DatabaseOutlined,
  DiffOutlined,
  FileSearchOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { studioApi } from '../api';
import { useWorkspaceContext } from '../workspace-context';
import type {
  RemoteMemorySearchHit,
  StoryMemoryRecord,
  WorkspaceMemoryDiffItem,
  WorkspaceMemoryDiffResponse,
} from '../types';

const { Paragraph, Text } = Typography;
const { Search } = Input;

const MEMORY_TYPE_OPTIONS = [
  'chapter_summary',
  'hook',
  'foreshadow',
  'plot_point',
  'character_event',
  'world_detail',
  'dialogue',
  'scene',
];

function shortText(value?: string | null, fallback = '—') {
  const text = (value || '').trim();
  if (!text) return fallback;
  if (text.length <= 80) return text;
  return `${text.slice(0, 80)}...`;
}

function memoryColumns(): ColumnsType<StoryMemoryRecord> {
  return [
    {
      title: '记忆',
      dataIndex: 'title',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.title || '未命名记忆'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.id || '缺少ID'}
          </Text>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'memory_type',
      width: 130,
      render: (value: string) => <Tag>{value || 'unknown'}</Tag>,
    },
    {
      title: '章节',
      width: 140,
      render: (_, record) => record.chapter_title || `时间线 ${record.story_timeline ?? '—'}`,
    },
    {
      title: '内容',
      dataIndex: 'content',
      render: (value: string) => shortText(value),
    },
    {
      title: '重要性',
      dataIndex: 'importance_score',
      width: 100,
      render: (value?: number) => (typeof value === 'number' ? value.toFixed(2) : '—'),
    },
  ];
}

export default function WorkspaceMemoriesPage() {
  const { message, modal } = App.useApp();
  const { workspaceName, data } = useWorkspaceContext();

  const [localPage, setLocalPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState(20);

  const [remotePage, setRemotePage] = useState(1);
  const [remotePageSize, setRemotePageSize] = useState(20);
  const [remoteTypeFilter, setRemoteTypeFilter] = useState<string>();
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteMemories, setRemoteMemories] = useState<StoryMemoryRecord[]>([]);
  const [remoteTotal, setRemoteTotal] = useState(0);

  const [diffLoading, setDiffLoading] = useState(false);
  const [diff, setDiff] = useState<WorkspaceMemoryDiffResponse | null>(null);

  const [searchText, setSearchText] = useState('');
  const [searchTypes, setSearchTypes] = useState<string[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<RemoteMemorySearchHit[]>([]);

  const localMemories = useMemo(
    () => ((data.story_memories || []) as StoryMemoryRecord[]).slice().sort((a, b) => (b.story_timeline || 0) - (a.story_timeline || 0)),
    [data.story_memories],
  );

  const pagedLocalMemories = useMemo(() => {
    const start = (localPage - 1) * localPageSize;
    return localMemories.slice(start, start + localPageSize);
  }, [localMemories, localPage, localPageSize]);

  const loadRemoteMemories = async (nextPage = remotePage, nextPageSize = remotePageSize, nextType = remoteTypeFilter) => {
    setRemoteLoading(true);
    try {
      const result = await studioApi.getRemoteWorkspaceMemories(workspaceName, nextPage, nextPageSize, nextType);
      setRemoteMemories(result.memories);
      setRemoteTotal(result.total);
      setRemotePage(result.page);
      setRemotePageSize(result.page_size);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载远端记忆失败');
    } finally {
      setRemoteLoading(false);
    }
  };

  const loadDiff = async () => {
    setDiffLoading(true);
    try {
      const result = await studioApi.getWorkspaceMemoryDiff(workspaceName);
      setDiff(result);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载记忆差异失败');
    } finally {
      setDiffLoading(false);
    }
  };

  useEffect(() => {
    loadRemoteMemories(1, remotePageSize, remoteTypeFilter);
    loadDiff();
  }, [workspaceName]);

  const handleSearch = async (value?: string) => {
    const query = (value ?? searchText).trim();
    if (!query) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const result = await studioApi.searchWorkspaceMemories(workspaceName, {
        query,
        memory_types: searchTypes,
        limit: 12,
        min_importance: 0,
      });
      setSearchResults(result.memories);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '语义检索失败');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleReindex = () => {
    modal.confirm({
      title: '重建远端记忆索引',
      content: '会对当前工作区关联的 MuMu 项目重新生成向量记忆索引，适合导入、同步或记忆异常后执行。',
      centered: true,
      onOk: async () => {
        try {
          const result = await studioApi.rebuildRemoteWorkspaceMemoryIndex(workspaceName);
          message.success(`远端记忆索引已重建：${result.rebuilt_count} 条`);
          await Promise.all([loadRemoteMemories(1, remotePageSize, remoteTypeFilter), loadDiff()]);
        } catch (error) {
          message.error(error instanceof Error ? error.message : '重建索引失败');
        }
      },
    });
  };

  const diffColumns: ColumnsType<WorkspaceMemoryDiffItem> = [
    {
      title: '记忆',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.title || '未命名记忆'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.id}
          </Text>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'memory_type',
      width: 130,
      render: (value: string) => <Tag color="orange">{value || 'unknown'}</Tag>,
    },
    {
      title: '差异字段',
      dataIndex: 'changed_fields',
      render: (value: string[]) => (
        <Space wrap>
          {value.map((field) => (
            <Tag key={field}>{field}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '本地内容',
      render: (_, record) => shortText(record.local.content),
    },
    {
      title: '远端内容',
      render: (_, record) => shortText(record.remote.content),
    },
  ];

  const searchColumns: ColumnsType<RemoteMemorySearchHit> = [
    {
      title: '命中记忆',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{String(record.metadata?.title || '未命名记忆')}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.id}
          </Text>
        </Space>
      ),
    },
    {
      title: '类型',
      width: 130,
      render: (_, record) => <Tag>{String(record.metadata?.memory_type || 'unknown')}</Tag>,
    },
    {
      title: '相关度',
      width: 100,
      render: (_, record) => record.similarity.toFixed(3),
    },
    {
      title: '内容',
      dataIndex: 'content',
      render: (value: string) => shortText(value),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card className="studio-card">
        <Row gutter={[16, 16]}>
          <Col xs={12} md={6}>
            <Statistic title="本地记忆" value={localMemories.length} prefix={<DatabaseOutlined />} />
          </Col>
          <Col xs={12} md={6}>
            <Statistic title="远端记忆" value={diff?.summary.remote_total ?? remoteTotal} prefix={<SyncOutlined />} />
          </Col>
          <Col xs={12} md={6}>
            <Statistic title="差异项" value={diff?.summary.changed ?? 0} prefix={<DiffOutlined />} />
          </Col>
          <Col xs={12} md={6}>
            <Statistic title="缺少ID" value={diff?.summary.local_missing_id ?? 0} prefix={<FileSearchOutlined />} />
          </Col>
        </Row>
      </Card>

      <Tabs
        defaultActiveKey="local"
        items={[
          {
            key: 'local',
            label: `本地记忆 (${localMemories.length})`,
            children: (
              <Card className="studio-card">
                <Table<StoryMemoryRecord>
                  rowKey={(record, index) => record.id || `local-${index}`}
                  columns={memoryColumns()}
                  dataSource={pagedLocalMemories}
                  pagination={{
                    current: localPage,
                    pageSize: localPageSize,
                    total: localMemories.length,
                    onChange: (page, pageSize) => {
                      setLocalPage(page);
                      setLocalPageSize(pageSize);
                    },
                    showSizeChanger: true,
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'remote',
            label: `远端记忆 (${remoteTotal})`,
            children: (
              <Card
                className="studio-card"
                extra={
                  <Space wrap>
                    <Select
                      allowClear
                      placeholder="过滤类型"
                      style={{ width: 180 }}
                      value={remoteTypeFilter}
                      options={MEMORY_TYPE_OPTIONS.map((item) => ({ label: item, value: item }))}
                      onChange={(value) => {
                        setRemoteTypeFilter(value);
                        void loadRemoteMemories(1, remotePageSize, value);
                      }}
                    />
                    <Button icon={<ReloadOutlined />} onClick={() => loadRemoteMemories(1, remotePageSize, remoteTypeFilter)}>
                      刷新
                    </Button>
                    <Button icon={<SyncOutlined />} onClick={handleReindex}>
                      重建索引
                    </Button>
                  </Space>
                }
              >
                <Table<StoryMemoryRecord>
                  rowKey={(record, index) => record.id || `remote-${index}`}
                  loading={remoteLoading}
                  columns={memoryColumns()}
                  dataSource={remoteMemories}
                  pagination={{
                    current: remotePage,
                    pageSize: remotePageSize,
                    total: remoteTotal,
                    onChange: (page, pageSize) => {
                      void loadRemoteMemories(page, pageSize, remoteTypeFilter);
                    },
                    showSizeChanger: true,
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'diff',
            label: `差异对比 (${diff?.summary.changed ?? 0})`,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Card
                  className="studio-card"
                  extra={
                    <Button icon={<ReloadOutlined />} loading={diffLoading} onClick={loadDiff}>
                      刷新差异
                    </Button>
                  }
                >
                  {diff ? (
                    <Row gutter={[16, 16]}>
                      <Col xs={12} md={4}>
                        <Statistic title="仅本地" value={diff.summary.local_only} />
                      </Col>
                      <Col xs={12} md={4}>
                        <Statistic title="仅远端" value={diff.summary.remote_only} />
                      </Col>
                      <Col xs={12} md={4}>
                        <Statistic title="内容冲突" value={diff.summary.changed} />
                      </Col>
                      <Col xs={12} md={4}>
                        <Statistic title="本地缺ID" value={diff.summary.local_missing_id} />
                      </Col>
                      <Col xs={12} md={4}>
                        <Statistic title="远端缺ID" value={diff.summary.remote_missing_id} />
                      </Col>
                    </Row>
                  ) : (
                    <Empty description="暂无差异数据" />
                  )}
                </Card>

                <Card className="studio-card" title="冲突记忆">
                  {diff && diff.changed.length > 0 ? (
                    <Table<WorkspaceMemoryDiffItem>
                      rowKey="id"
                      columns={diffColumns}
                      dataSource={diff.changed}
                      pagination={{ pageSize: 10, showSizeChanger: true }}
                    />
                  ) : (
                    <Empty description="当前没有同 ID 但内容不同的记忆" />
                  )}
                </Card>

                <Row gutter={[16, 16]}>
                  <Col xs={24} xl={12}>
                    <Card className="studio-card" title={`仅本地 (${diff?.summary.local_only ?? 0})`}>
                      {diff && diff.local_only.length > 0 ? (
                        <Table<StoryMemoryRecord>
                          rowKey={(record, index) => record.id || `local-only-${index}`}
                          columns={memoryColumns()}
                          dataSource={diff.local_only}
                          pagination={{ pageSize: 6 }}
                        />
                      ) : (
                        <Empty description="暂无仅本地记忆" />
                      )}
                    </Card>
                  </Col>
                  <Col xs={24} xl={12}>
                    <Card className="studio-card" title={`仅远端 (${diff?.summary.remote_only ?? 0})`}>
                      {diff && diff.remote_only.length > 0 ? (
                        <Table<StoryMemoryRecord>
                          rowKey={(record, index) => record.id || `remote-only-${index}`}
                          columns={memoryColumns()}
                          dataSource={diff.remote_only}
                          pagination={{ pageSize: 6 }}
                        />
                      ) : (
                        <Empty description="暂无仅远端记忆" />
                      )}
                    </Card>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: 'search',
            label: `语义检索 (${searchResults.length})`,
            children: (
              <Card className="studio-card">
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Space wrap style={{ width: '100%' }}>
                    <Search
                      allowClear
                      enterButton={<><SearchOutlined /> 检索</>}
                      placeholder="输入查询词，例如：石门、张三、伏笔、第一章"
                      style={{ minWidth: 320, flex: 1 }}
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      onSearch={(value) => void handleSearch(value)}
                    />
                    <Select
                      mode="multiple"
                      allowClear
                      maxTagCount="responsive"
                      placeholder="限制记忆类型（可选）"
                      style={{ minWidth: 260 }}
                      value={searchTypes}
                      options={MEMORY_TYPE_OPTIONS.map((item) => ({ label: item, value: item }))}
                      onChange={setSearchTypes}
                    />
                  </Space>
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    当前检索直接复用 MuMu 的远端向量记忆。若刚完成导入或同步但结果异常，可先到“远端记忆”里执行一次重建索引。
                  </Paragraph>
                  <Table<RemoteMemorySearchHit>
                    rowKey="id"
                    loading={searchLoading}
                    columns={searchColumns}
                    dataSource={searchResults}
                    pagination={{ pageSize: 8, hideOnSinglePage: true }}
                    locale={{ emptyText: searchText ? '没有找到相关记忆' : '输入查询后开始检索' }}
                  />
                </Space>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
