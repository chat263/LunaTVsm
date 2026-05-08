/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  memo,
  startTransition,
} from 'react';
import {
  Plus,
  Trash2,
  Loader2,
  Download,
  Upload,
  ChevronDown,
  ChevronUp,
  Check,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
// 统一按钮样式系统（保持不变）
const buttonStyles = {
  primary:
    'px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-lg transition-colors',
  success:
    'px-3 py-1.5 text-sm font-medium bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-lg transition-colors',
  danger:
    'px-3 py-1.5 text-sm font-medium bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-lg transition-colors',
  secondary:
    'px-3 py-1.5 text-sm font-medium bg-gray-600 hover:bg-gray-700 dark:bg-gray-600 dark:hover:bg-gray-700 text-white rounded-lg transition-colors',
  warning:
    'px-3 py-1.5 text-sm font-medium bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-white rounded-lg transition-colors',
  primarySmall:
    'px-2 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-md transition-colors',
  successSmall:
    'px-2 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-md transition-colors',
  dangerSmall:
    'px-2 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-md transition-colors',
  secondarySmall:
    'px-2 py-1 text-xs font-medium bg-gray-600 hover:bg-gray-700 dark:bg-gray-600 dark:hover:bg-gray-700 text-white rounded-md transition-colors',
  warningSmall:
    'px-2 py-1 text-xs font-medium bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-white rounded-md transition-colors',
  roundedPrimary:
    'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 dark:text-blue-200 transition-colors',
  roundedSuccess:
    'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:hover:bg-green-900/60 dark:text-green-200 transition-colors',
  roundedDanger:
    'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 dark:text-red-200 transition-colors',
  roundedSecondary:
    'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700/40 dark:hover:bg-gray-700/60 dark:text-gray-200 transition-colors',
  roundedWarning:
    'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:hover:bg-yellow-900/60 dark:text-yellow-200 transition-colors',
  roundedPurple:
    'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-900/40 dark:hover:bg-purple-900/60 dark:text-purple-200 transition-colors',
  disabled:
    'px-3 py-1.5 text-sm font-medium bg-gray-400 dark:bg-gray-600 cursor-not-allowed text-white rounded-lg transition-colors',
  disabledSmall:
    'px-2 py-1 text-xs font-medium bg-gray-400 dark:bg-gray-600 cursor-not-allowed text-white rounded-md transition-colors',
  toggleOn: 'bg-green-600 dark:bg-green-600',
  toggleOff: 'bg-gray-200 dark:bg-gray-700',
  toggleThumb: 'bg-white',
  toggleThumbOn: 'translate-x-6',
  toggleThumbOff: 'translate-x-1',
  quickAction:
    'px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors',
};
interface WordListSectionProps {
  type: keyof WordListData;
  title: string;
  icon: string;
  colorClass: string;
  addButtonStyle: string;
  words: string[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  newWord: string;
  onNewWordChange: (value: string) => void;
  onAdd: () => void;
  onExport: () => void;
  onImport: () => void;
  editing: EditingState | null;
  onStartEdit: (type: keyof WordListData, word: string) => void;
  onDelete: (type: keyof WordListData, word: string) => void;
  onConfirmEdit: () => void;
  onCancelEdit: () => void;
  onTempChange: (value: string) => void;
  onEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  editInputRef: React.RefObject<HTMLInputElement | null>;
}
interface WordListData {
  hot: string[];
  sensitive: string[];
  actor: string[];
}

interface WordListConfigProps {
  refreshConfig?: () => Promise<void>;
}

interface EditingState {
  type: keyof WordListData;
  originalWord: string;
  tempWord: string;
}

// 抽离词条组件，使用 memo 避免不必要的重绘
const WordItem = memo(
  ({
    word,
    type,
    colorClass,
    isEditing,
    editingTemp,
    onStartEdit,
    onDelete,
    onConfirmEdit,
    onCancelEdit,
    onTempChange,
    onEditKeyDown,
    editInputRef,
  }: {
    word: string;
    type: keyof WordListData;
    colorClass: string;
    isEditing: boolean;
    editingTemp?: string;
    onStartEdit: (type: keyof WordListData, word: string) => void;
    onDelete: (type: keyof WordListData, word: string) => void;
    onConfirmEdit: () => void;
    onCancelEdit: () => void;
    onTempChange: (value: string) => void;
    onEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    editInputRef: React.RefObject<HTMLInputElement | null>;
  }) => {
    if (isEditing) {
      return (
        <div
          className='inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 border border-blue-400'
          key={word}
        >
          <input
            ref={editInputRef}
            type='text'
            value={editingTemp}
            onChange={(e) => onTempChange(e.target.value)}
            onKeyDown={onEditKeyDown}
            className='bg-transparent outline-none text-gray-900 dark:text-gray-100 w-auto min-w-[60px] max-w-[200px]'
            size={Math.max(editingTemp?.length || word.length, 2)}
          />
          <button
            onClick={onConfirmEdit}
            className='text-green-600 hover:text-green-800 dark:text-green-400'
          >
            <Check size={14} />
          </button>
          <button
            onClick={onCancelEdit}
            className='text-gray-500 hover:text-gray-700 dark:text-gray-400'
          >
            <X size={14} />
          </button>
        </div>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full cursor-pointer hover:opacity-80 transition-opacity ${colorClass}`}
        onClick={() => onStartEdit(type, word)}
      >
        {word}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(type, word);
          }}
          className='hover:text-red-600'
        >
          <Trash2 size={14} />
        </button>
      </span>
    );
  },
);

WordItem.displayName = 'WordItem';

// 独立模块组件，支持折叠/展开 + 虚拟网格滚动
const WordListSection = memo((props: WordListSectionProps) => {
  const {
    type,
    title,
    icon,
    colorClass,
    addButtonStyle,
    words,
    collapsed,
    onToggleCollapse,
    newWord,
    onNewWordChange,
    onAdd,
    onExport,
    onImport,
    editing,
    onStartEdit,
    onDelete,
    onConfirmEdit,
    onCancelEdit,
    onTempChange,
    onEditKeyDown,
    editInputRef,
  } = props;
  // ========== 所有 Hooks 必须放在组件最顶部，无条件调用 ==========
  const [page, setPage] = useState(1);
  const [columns, setColumns] = useState(4);
  const gridRef = useRef<HTMLDivElement>(null);

  const detectColumns = useCallback(() => {
    if (!gridRef.current) return;
    const width = gridRef.current.clientWidth;
    if (width >= 1600) setColumns(12);
    else if (width >= 1400) setColumns(10);
    else if (width >= 1200) setColumns(8);
    else if (width >= 1000) setColumns(6);
    else if (width >= 900) setColumns(5);
    else if (width >= 600) setColumns(4);
    else if (width >= 400) setColumns(3);
    else setColumns(2);
  }, []);

  useEffect(() => {
    detectColumns();
    const ro = new ResizeObserver(detectColumns);
    if (gridRef.current) ro.observe(gridRef.current);
    return () => ro.disconnect();
  }, [detectColumns]);

  const pageSize = 120;
  const totalPages = Math.ceil(words.length / pageSize);
  const paginatedWords = words.slice((page - 1) * pageSize, page * pageSize);

  // 样式常量（不影响 Hooks 规则）
  const sectionStyle =
    'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700';
  const inputStyle =
    'flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500';

  // 分页组件（纯函数，非 Hook）
  const Pagination = ({ total, current, onChange }) => {
    if (total <= 1) return null;
    const maxVisible = 5;
    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    let end = Math.min(total, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    return (
      <div className='flex justify-center mt-6 gap-2'>
        <button
          onClick={() => onChange(current - 1)}
          disabled={current === 1}
          className='px-3 py-1 text-sm rounded-md bg-gray-200 dark:bg-gray-700 disabled:opacity-50'
        >
          上一页
        </button>
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`px-3 py-1 text-sm rounded-md ${
              p === current
                ? 'bg-green-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onChange(current + 1)}
          disabled={current === total}
          className='px-3 py-1 text-sm rounded-md bg-gray-200 dark:bg-gray-700 disabled:opacity-50'
        >
          下一页
        </button>
      </div>
    );
  };

  // ========== 折叠状态渲染 ==========
  if (collapsed) {
    const isOverflow = words.length > 12;
    return (
      <div className={sectionStyle}>
        <div className='flex justify-between items-center mb-3'>
          <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
            {icon} {title} ({words.length})
          </h3>
          <div className='flex gap-2'>
            <button
              onClick={onExport}
              className={buttonStyles.secondarySmall}
              title='导出 JSON'
            >
              <Download size={16} />
            </button>
            <button
              onClick={onImport}
              className={buttonStyles.primarySmall}
              title='导入 JSON'
            >
              <Upload size={16} />
            </button>
            <button
              onClick={onToggleCollapse}
              className={buttonStyles.secondarySmall}
              title='展开'
            >
              <ChevronDown size={16} />
            </button>
          </div>
        </div>

        <div className='flex gap-2 mb-4'>
          <input
            type='text'
            placeholder='输入内容，多个可用逗号/分号分隔'
            value={newWord}
            onChange={(e) => onNewWordChange(e.target.value)}
            className={inputStyle}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          />
          <button onClick={onAdd} className={addButtonStyle}>
            <Plus size={18} />
          </button>
        </div>

        <div className='max-h-32 overflow-hidden'>
          <div className='flex flex-wrap gap-2'>
            {words.slice(0, 12).map((word) => {
              const isEditing =
                editing?.type === type && editing?.originalWord === word;
              return (
                <WordItem
                  key={word}
                  word={word}
                  type={type}
                  colorClass={colorClass}
                  isEditing={isEditing}
                  editingTemp={isEditing ? editing?.tempWord : undefined}
                  onStartEdit={onStartEdit}
                  onDelete={onDelete}
                  onConfirmEdit={onConfirmEdit}
                  onCancelEdit={onCancelEdit}
                  onTempChange={onTempChange}
                  onEditKeyDown={onEditKeyDown}
                  editInputRef={editInputRef}
                />
              );
            })}
            {words.length > 12 && (
              <span className='text-gray-400 text-sm self-center'>
                +{words.length - 12} 个
              </span>
            )}
          </div>
        </div>
        {isOverflow && (
          <button
            onClick={onToggleCollapse}
            className='mt-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 flex items-center gap-1'
          >
            <ChevronDown size={16} /> 展开全部
          </button>
        )}
      </div>
    );
  }

  // ========== 展开状态：分页 + 多列网格 ==========
  return (
    <div className={sectionStyle}>
      <div className='flex justify-between items-center mb-3'>
        <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
          {icon} {title} ({words.length})
        </h3>
        <div className='flex gap-2'>
          <button
            onClick={onExport}
            className={buttonStyles.secondarySmall}
            title='导出 JSON'
          >
            <Download size={16} />
          </button>
          <button
            onClick={onImport}
            className={buttonStyles.primarySmall}
            title='导入 JSON'
          >
            <Upload size={16} />
          </button>
          <button
            onClick={onToggleCollapse}
            className={buttonStyles.secondarySmall}
            title='收起'
          >
            <ChevronUp size={16} />
          </button>
        </div>
      </div>

      <div className='flex gap-2 mb-4'>
        <input
          type='text'
          placeholder='输入内容，多个可用逗号/分号分隔'
          value={newWord}
          onChange={(e) => onNewWordChange(e.target.value)}
          className={inputStyle}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        />
        <button onClick={onAdd} className={addButtonStyle}>
          <Plus size={18} />
        </button>
      </div>

      {words.length === 0 ? (
        <div className='text-gray-500 text-sm py-4'>暂无数据</div>
      ) : (
        <>
          {/* flex 自适应布局容器 */}
          <div className='flex flex-wrap gap-2'>
            {paginatedWords.map((word) => {
              const isEditing =
                editing?.type === type && editing?.originalWord === word;
              return (
                <WordItem
                  key={word}
                  word={word}
                  type={type}
                  colorClass={colorClass}
                  isEditing={isEditing}
                  editingTemp={isEditing ? editing?.tempWord : undefined}
                  onStartEdit={onStartEdit}
                  onDelete={onDelete}
                  onConfirmEdit={onConfirmEdit}
                  onCancelEdit={onCancelEdit}
                  onTempChange={onTempChange}
                  onEditKeyDown={onEditKeyDown}
                  editInputRef={editInputRef}
                />
              );
            })}
          </div>
          <Pagination
            total={totalPages}
            current={page}
            onChange={(p) => setPage(p)}
          />
        </>
      )}
    </div>
  );
});
WordListSection.displayName = 'WordListSection';

export default function WordListConfig({ refreshConfig }: WordListConfigProps) {
  // ========== 所有 Hooks 放在组件顶层 ==========
  const [data, setData] = useState<WordListData>({
    hot: [],
    sensitive: [],
    actor: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newWords, setNewWords] = useState({
    hot: '',
    sensitive: '',
    actor: '',
  });

  const [editing, setEditing] = useState<EditingState | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const [collapsed, setCollapsed] = useState({
    hot: true,
    sensitive: true,
    actor: true,
  });

  // ========== 数据操作函数 ==========
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/wordlists');
      if (!res.ok) throw new Error('加载失败');
      const result = await res.json();
      setData({
        hot: result.hot || [],
        sensitive: result.sensitive || [],
        actor: result.actor || [],
      });
    } catch (err) {
      console.error(err);
      toast.error('加载配置失败');
    } finally {
      setLoading(false);
    }
  }, []);
  // 检查某个词是否在任何词库中已存在（可选择排除某个类型）
  const isWordExistsInAnyList = useCallback(
    (word: string, excludeType?: keyof WordListData): boolean => {
      const normalized = word.trim().toLowerCase();
      for (const key of ['hot', 'sensitive', 'actor'] as const) {
        if (excludeType === key) continue;
        if (data[key].some((w) => w.trim().toLowerCase() === normalized)) {
          return true;
        }
      }
      return false;
    },
    [data],
  );
  const saveData = useCallback(
    async (newData: WordListData) => {
      try {
        setSaving(true);
        const res = await fetch('/api/admin/wordlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newData),
        });
        if (!res.ok) throw new Error('保存失败');
        if (refreshConfig) await refreshConfig();
      } catch (err) {
        console.error(err);
        alert('保存失败');
      } finally {
        setSaving(false);
      }
    },
    [refreshConfig],
  );

  // 添加词
  const handleAdd = useCallback(
    (type: keyof WordListData) => {
      const raw = newWords[type].trim();
      if (!raw) return;
      const words = raw
        .split(/[;,，；]/)
        .map((w) => w.trim())
        .filter((w) => w !== '');
      if (words.length === 0) return;

      const duplicates: string[] = [];
      const validWords: string[] = [];

      for (const w of words) {
        if (isWordExistsInAnyList(w)) {
          duplicates.push(w);
        } else {
          validWords.push(w);
        }
      }

      if (duplicates.length > 0) {
        toast.warning(`【${duplicates.join('、')}】已存在`, {
          description: validWords.length ? '已添加其他词条' : '未添加任何词条',
        });
        if (validWords.length === 0) return;
      }

      startTransition(() => {
        const newData = { ...data };
        validWords.forEach((w) => {
          if (!newData[type].includes(w)) {
            newData[type].push(w);
          }
        });
        setData(newData);
        setNewWords((prev) => ({ ...prev, [type]: '' }));
        saveData(newData);
        if (validWords.length > 0) {
          toast.success('添加成功', {
            description: `${validWords.join('、')}`,
          });
        }
      });
    },
    [data, newWords, saveData, isWordExistsInAnyList],
  );

  const handleDelete = useCallback(
    (type: keyof WordListData, word: string) => {
      startTransition(() => {
        const newData = {
          ...data,
          [type]: data[type].filter((w) => w !== word),
        };
        setData(newData);
        saveData(newData);
      });
    },
    [data, saveData],
  );

  const startEdit = useCallback((type: keyof WordListData, word: string) => {
    setEditing({
      type,
      originalWord: word,
      tempWord: word,
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditing(null);
  }, []);

  const confirmEdit = useCallback(() => {
    if (!editing) return;
    const { type, originalWord, tempWord } = editing;
    const newTemp = tempWord.trim();
    if (newTemp === '') {
      toast.error('词条不能为空');
      return;
    }
    if (newTemp === originalWord) {
      setEditing(null);
      return;
    }

    // 检查是否在其他词库中已存在
    const existsInOther = isWordExistsInAnyList(newTemp, type);
    if (existsInOther) {
      toast.error(`“${newTemp}” 已在其他词库中存在，不能重复添加`);
      return;
    }

    // 检查当前类型中是否有同名（排除自身）
    const existsInSame = data[type].some(
      (w) =>
        w !== originalWord && w.trim().toLowerCase() === newTemp.toLowerCase(),
    );
    if (existsInSame) {
      toast.error(`“${newTemp}” 已在当前词库中存在，不能重复添加`);
      return;
    }

    startTransition(() => {
      const newData = {
        ...data,
        [type]: data[type].map((w) => (w === originalWord ? newTemp : w)),
      };
      setData(newData);
      saveData(newData);
      setEditing(null);
    });
  }, [editing, data, saveData, isWordExistsInAnyList]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [confirmEdit, cancelEdit],
  );

  const handleExport = useCallback(
    (type: keyof WordListData) => {
      const exportData = data[type];
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wordlist_${type}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [data],
  );

  const handleImport = useCallback(
    (type: keyof WordListData) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const imported = JSON.parse(text);
          if (Array.isArray(imported)) {
            startTransition(() => {
              const newData = { ...data, [type]: imported };
              setData(newData);
              saveData(newData);
            });
          } else {
            toast.error('文件格式错误：期望一个数组');
          }
        } catch (err) {
          console.error(err);
          toast.error('解析 JSON 失败');
        }
      };
      input.click();
    },
    [data, saveData],
  );

  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className='flex justify-center py-8'>
        <Loader2 className='w-6 h-6 animate-spin text-gray-500' />
      </div>
    );
  }

  const renderSectionProps = (type: keyof WordListData) => ({
    type,
    title:
      type === 'hot'
        ? '热门标签'
        : type === 'sensitive'
          ? '敏感词'
          : '演员列表',
    icon: type === 'hot' ? '🔥' : type === 'sensitive' ? '⚠️' : '🎭',
    colorClass:
      type === 'hot'
        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
        : type === 'sensitive'
          ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
          : 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    addButtonStyle:
      type === 'hot'
        ? buttonStyles.success
        : type === 'sensitive'
          ? buttonStyles.danger
          : buttonStyles.primary,
    words: data[type],
    collapsed: collapsed[type],
    onToggleCollapse: () =>
      setCollapsed((prev) => ({ ...prev, [type]: !prev[type] })),
    newWord: newWords[type],
    onNewWordChange: (value: string) =>
      setNewWords((prev) => ({ ...prev, [type]: value })),
    onAdd: () => handleAdd(type),
    onExport: () => handleExport(type),
    onImport: () => handleImport(type),
    editing,
    onStartEdit: startEdit,
    onDelete: handleDelete,
    onConfirmEdit: confirmEdit,
    onCancelEdit: cancelEdit,
    onTempChange: (value: string) =>
      setEditing((prev) => (prev ? { ...prev, tempWord: value } : null)),
    onEditKeyDown: handleEditKeyDown,
    editInputRef,
  });

  return (
    <div className='space-y-6'>
      {saving && (
        <div className='fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50'>
          <Loader2 className='w-4 h-4 animate-spin' />
          保存中...
        </div>
      )}

      <WordListSection {...renderSectionProps('hot')} />
      <WordListSection {...renderSectionProps('sensitive')} />
      <WordListSection {...renderSectionProps('actor')} />
    </div>
  );
}
