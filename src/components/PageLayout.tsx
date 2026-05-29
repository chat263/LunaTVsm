'use client';

import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { isAIRecommendFeatureDisabled } from '@/lib/ai-recommend.client';

import AIRecommendModal from './AIRecommendModal';
import { BackButton } from './BackButton';
import MobileBottomNav from './MobileBottomNav';
import MobileHeader from './MobileHeader';
import ModernNav from './ModernNav';
import Sidebar from './Sidebar';
import { useSite } from './SiteProvider';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  useModernNav?: boolean; // 新增：是否使用2025现代化导航
}

const PageLayout = ({
  children,
  activePath = '/',
  useModernNav = true,
}: PageLayoutProps) => {
  const { siteName } = useSite();

  // ✨ AI 推荐功能 - 全局管理
  const [showAIRecommendModal, setShowAIRecommendModal] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(true);

  // 检查 AI 功能是否开启
  useEffect(() => {
    const disabled = isAIRecommendFeatureDisabled();
    setAiEnabled(!disabled);
  }, []);

  if (useModernNav) {
    // Modern layout - 只返回内容，导航栏由 NavigationShell 处理
    // translate="no" 阻止浏览器翻译插件修改 DOM 导致 React reconciler 崩溃
    return <div translate="no">{children}</div>;
  }

  // Legacy Sidebar Layout (原来的设计)
  return (
    <div className='w-full min-h-screen'>
      {/* 移动端头部 */}
      <MobileHeader showBackButton={['/play', '/live'].includes(activePath)} />

      {/* 主要布局容器 */}
      <div className='flex md:grid md:grid-cols-[auto_1fr] w-full min-h-screen md:min-h-auto'>
        {/* 侧边栏 - 桌面端显示，移动端隐藏 */}
        <div className='hidden md:block'>
          <Sidebar activePath={activePath} />
        </div>

        {/* 主内容区域 */}
        <div className='relative min-w-0 flex-1 transition-all duration-300'>
          {/* 桌面端左上角返回按钮 */}
          {['/play', '/live'].includes(activePath) && (
            <div className='absolute top-3 left-1 z-20 hidden md:flex'>
              <BackButton />
            </div>
          )}

          {/* ✨ 桌面端顶部按钮 - AI, Theme Toggle & User Menu */}
          <div className='absolute top-2 right-4 z-20 hidden md:flex items-center gap-2'>
            {aiEnabled && (
              <button
                onClick={() => setShowAIRecommendModal(true)}
                className='relative p-2 rounded-lg bg-linear-to-br from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 active:scale-95 transition-all duration-200 shadow-lg shadow-blue-500/30 group'
                aria-label='AI 推荐'
              >
                <Sparkles className='h-5 w-5 group-hover:scale-110 transition-transform duration-300' />
              </button>
            )}
            <ThemeToggle />
            <UserMenu />
          </div>

          {/* 主内容 */}
          <main
            className='flex-1 md:min-h-0 mb-14 md:mb-0 md:mt-0 mt-12'
            style={{
              // 悬浮胶囊导航栏高度约 56px + 底部 1rem 间距 + 安全区
              paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))',
            }}
          >
            {children}
          </main>
        </div>
      </div>

      {/* 移动端底部导航 */}
      <div className='md:hidden'>
        <MobileBottomNav activePath={activePath} />
      </div>

      {/* ✨ AI 推荐弹窗 */}
      <AIRecommendModal
        isOpen={showAIRecommendModal}
        onClose={() => setShowAIRecommendModal(false)}
      />
    </div>
  );
};

export default PageLayout;
