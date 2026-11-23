import { useEffect, useRef, type TouchEvent as ReactTouchEvent } from 'react';
import { useHashRoute, navigate } from './lib/router';
import { BottomNav } from './components/BottomNav';
import { Home } from './views/Home';
import { Subjects } from './views/Subjects';
import { SubjectDetail } from './views/SubjectDetail';
import { KpDetail } from './views/KpDetail';
import { StarMapView } from './views/StarMap';
import { SessionView } from './views/Session';
import { WrongBook } from './views/WrongBook';
import { Stats } from './views/Stats';
import { Settings } from './views/Settings';
import { PaperPreview } from './views/PaperPreview';
import { PaperExam } from './views/PaperExam';
import { PaperResult } from './views/PaperResult';
import { PaperImport } from './views/PaperImport';
import { TextList } from './views/TextList';
import { TextDetail } from './views/TextDetail';
import { BattleView } from './game/Battle';

const TAB_ROUTES = new Set(['/', '/subjects', '/wrong', '/stats', '/settings']);
const FULL_ROUTES = new Set(['/session', '/star']);
const TAB_ORDER = ['/', '/subjects', '/wrong', '/stats', '/settings'];

function NotFound() {
  return (
    <div className="view">
      <div className="empty">
        <h3>这里还没有星图</h3>
        <p>页面走丢了，回今日看看。</p>
        <button className="btn btn--primary" onClick={() => { window.location.hash = '/'; }}>
          返回今日
        </button>
      </div>
    </div>
  );
}

export function App() {
  const { path, query, segments } = useHashRoute();
  const touchRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [path]);

  // 鼠标侧键（3=后退，4=前进）与 Alt+←/→
  useEffect(() => {
    let last = 0;
    const go = (dir: -1 | 1) => {
      const now = Date.now();
      if (now - last < 280) return;
      last = now;
      if (dir < 0) window.history.back();
      else window.history.forward();
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      go(e.button === 3 ? -1 : 1);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const tabIndex = TAB_ORDER.indexOf(path);
  const swipeTo = (delta: number) => {
    if (tabIndex < 0) return;
    const next = TAB_ORDER[tabIndex + delta];
    if (next) navigate(next);
  };

  const onTouchStart = (e: ReactTouchEvent) => {
    if (!TAB_ROUTES.has(path)) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        '[data-no-swipe], .subject-scroller, .kmap, .chips, .seg, .sheet, .drawer, input, textarea, select',
      )
    ) {
      touchRef.current.active = false;
      return;
    }
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, active: true };
  };

  const onTouchEnd = (e: ReactTouchEvent) => {
    if (!touchRef.current.active) return;
    touchRef.current.active = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    swipeTo(dx < 0 ? 1 : -1);
  };

  let page = <NotFound />;
  if (path === '/') page = <Home />;
  else if (path === '/subjects') page = <Subjects />;
  else if (path === '/star')
    page = (
      <StarMapView
        initialSubjectId={query.get('subject') ?? undefined}
        focusId={query.get('focus') ?? undefined}
      />
    );
  else if (path === '/wrong') page = <WrongBook />;
  else if (path === '/stats') page = <Stats />;
  else if (path === '/settings') page = <Settings />;
  else if (path === '/session') page = <SessionView />;
  else if (path === '/paper-import') page = <PaperImport />;
  else if (path === '/battle') page = <BattleView />;
  else if (path === '/texts') page = <TextList />;
  else if (segments[0] === 'text' && segments[1])
    page = <TextDetail textId={segments[1]} />;
  else if (segments[0] === 'paper' && segments[1]) {
    const mode = segments[2];
    page =
      mode === 'take' ? (
        <PaperExam paperId={segments[1]} />
      ) : mode === 'result' ? (
        <PaperResult paperId={segments[1]} />
      ) : (
        <PaperPreview paperId={segments[1]} />
      );
  }
  else if (segments[0] === 'subject' && segments[1])
    page = <SubjectDetail subjectId={segments[1]} />;
  else if (segments[0] === 'kp' && segments[1]) page = <KpDetail kpId={segments[1]} />;

  const showNav = TAB_ROUTES.has(path);
  const full = FULL_ROUTES.has(path);

  return (
    <div
      className={`app ${full ? 'app--full' : ''} ${showNav ? 'app--tabbed' : ''}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="route-shell" key={`${path}?${query.toString()}`}>
        {page}
      </div>
      {showNav && <BottomNav active={path} />}
    </div>
  );
}
