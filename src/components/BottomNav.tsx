import { Icon, type IconName } from './Icon';
import { navigate } from '../lib/router';

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: '今日', icon: 'sun' },
  { to: '/subjects', label: '科目', icon: 'grid' },
  { to: '/wrong', label: '错题', icon: 'bookmark' },
  { to: '/stats', label: '统计', icon: 'chart' },
  { to: '/settings', label: '我的', icon: 'user' },
];

export function BottomNav({ active }: { active: string }) {
  return (
    <nav className="bottom-nav" aria-label="主导航">
      <div className="bottom-nav-inner">
        {TABS.map((tab) => {
          const on = active === tab.to;
          return (
            <button
              key={tab.to}
              className={`nav-item ${on ? 'is-on' : ''}`}
              aria-current={on ? 'page' : undefined}
              onClick={() => navigate(tab.to)}
            >
              <span className="nav-icon">
                <Icon name={tab.icon} size={21} filled={on} />
              </span>
              <span className="nav-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
