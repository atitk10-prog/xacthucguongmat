import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import LoginPage from './components/auth/LoginPage';
import EventList from './components/events/EventList';
import EventForm from './components/events/EventForm';
import CheckinPage from './components/checkin/CheckinPage';
import BoardingCheckin from './components/boarding/BoardingCheckin';
import BoardingConfigPage from './components/boarding/BoardingConfigPage';
import RoomManagement from './components/boarding/RoomManagement';
import ExitPermission from './components/boarding/ExitPermission';
import RankingBoard from './components/reports/RankingBoard';
import EventReport from './components/reports/EventReport';
import CertificateGenerator from './components/certificates/CertificateGenerator';
import CardGenerator from './components/certificates/CardGenerator';
import UserManagement from './components/users/UserManagement';
import SystemConfig from './components/settings/SystemConfig';
import FaceIDManagement from './components/settings/FaceIDManagement';
import PointManagement from './components/settings/PointManagement';
import PointStatistics from './components/reports/PointStatistics';
import AIAnalysis from './components/reports/AIAnalysis';
import StudentLayout from './components/student/StudentLayout'; // Import StudentLayout
import AdminProfile from './components/profile/AdminProfile';
import SelfCheckinPage from './components/checkin/SelfCheckinPage';
import { Icons, NotificationList } from './components/ui';
import { dataService } from './services/dataService';
import { useToast } from './components/ui/Toast';
import { User, Event } from './types';

type AppView =
  | 'login' | 'dashboard' | 'events' | 'event-form' | 'checkin'
  | 'boarding' | 'rooms' | 'exit-permission' | 'boarding-config' | 'boarding-run'
  | 'reports' | 'event-report' | 'ranking' | 'points-stats' | 'ai-analysis'
  | 'users' | 'certificates' | 'cards' | 'faceid'
  | 'settings' | 'points' | 'self-checkin' | 'profile-admin' | 'help' | 'permissions';

import HelpCenter from './components/HelpCenter';
import PermissionSettings from './components/settings/PermissionSettings';

interface MenuItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  type?: 'divider' | 'link';
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<AppView>('login');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [boardingTab, setBoardingTab] = useState<'dashboard' | 'config' | 'rooms' | 'exit' | 'report'>('dashboard');
  const [teacherPermissions, setTeacherPermissions] = useState<any[]>([]);
  const toast = useToast();

  useEffect(() => {
    let permSub: any;

    const initApp = async () => {
      const storedUser = dataService.getStoredUser();

      // Load initial permissions
      const loadPerms = async () => {
        const permRes = await dataService.getTeacherPermissions();
        if (permRes.success && permRes.data) {
          setTeacherPermissions(permRes.data);
        }
      };

      await loadPerms();

      // Set up REALTIME listener for permissions
      permSub = dataService.subscribeToTeacherPermissions((payload) => {
        console.log('📡 [Permissions] Realtime update from DB:', payload.new);
        setTeacherPermissions(prev => prev.map(p =>
          p.module_id === payload.new.module_id ? payload.new : p
        ));
      });

      // Check for Check-in URL parsing FIRST
      const path = window.location.pathname;

      if (path === '/boarding-run') {
        const urlParams = new URLSearchParams(window.location.search);
        const staffToken = urlParams.get('token');

        if (staffToken === dataService.GUEST_STAFF_TOKEN || (storedUser && dataService.isAuthenticated())) {
          if (staffToken === dataService.GUEST_STAFF_TOKEN && !storedUser) {
            setCurrentUser({
              id: 'guest_boarding_staff',
              full_name: 'Máy điểm danh Nội trú',
              role: 'teacher',
              email: 'guest@educheck.local',
              avatar_url: '',
              status: 'active',
              student_code: 'GUEST',
              organization: 'Cán bộ hỗ trợ',
              created_at: new Date().toISOString(),
              total_points: 0
            });
          } else {
            setCurrentUser(storedUser);
          }
          setView('boarding-run' as AppView);
          setIsLoading(false);
          return;
        }
      }

      if (path.startsWith('/self-checkin/')) {
        const eventId = path.split('/')[2];
        if (eventId) {
          if (storedUser && dataService.isAuthenticated()) {
            setCurrentUser(storedUser);
            setSelectedEventId(eventId);
            setView('self-checkin');
          } else {
            // Need login, but remember where to go
            localStorage.setItem('redirect_after_login', path);
            setView('login');
          }
          setIsLoading(false);
          return;
        }
      }

      if (path.startsWith('/checkin/')) {
        const parts = path.split('/');
        const eventId = parts[2];
        const urlParams = new URLSearchParams(window.location.search);
        const staffToken = urlParams.get('token');

        if (eventId) {
          // If has staff token, we allow guest access
          if (staffToken === dataService.GUEST_STAFF_TOKEN) {
            // Mock a guest staff user
            const guestUser: User = {
              id: 'guest_staff_' + eventId,
              full_name: 'Máy điểm danh phụ',
              role: 'teacher',
              email: 'guest@educheck.local',
              avatar_url: '',
              status: 'active',
              student_code: 'GUEST',
              organization: 'Cán bộ hỗ trợ',
              created_at: new Date().toISOString(),
              total_points: 0
            };

            // Fetch event details
            try {
              const res = await dataService.getEvent(eventId);
              if (res.success && res.data) {
                setCurrentUser(guestUser);
                setSelectedEvent(res.data);
                setView('checkin');
                setIsLoading(false);
                return;
              }
            } catch (e) {
              console.error('Guest access failed:', e);
            }
          }

          // Regular logged-in check
          if (storedUser && dataService.isAuthenticated()) {
            setCurrentUser(storedUser);

            // Fetch event details
            try {
              const res = await dataService.getEvent(eventId);
              if (res.success && res.data) {
                setSelectedEvent(res.data);
                setView('checkin');
              } else {
                setView('dashboard');
              }
            } catch (error) {
              setView('dashboard');
            }

            loadUsers();
            setIsLoading(false);
            return;
          }
        }
      }

      // Default routing
      if (storedUser && dataService.isAuthenticated()) {
        setCurrentUser(storedUser);
        setView('dashboard');
        loadUsers();
      }
      setIsLoading(false);
    };

    initApp();

    // Register Service Worker for Push Notifications
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('[App] Service Worker registered:', registration.scope);
        })
        .catch(error => {
          console.warn('[App] Service Worker registration failed:', error);
        });
    }
  }, []);

  useEffect(() => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'teacher')) return;

    const loadPending = async () => {
      const res = await dataService.getPendingExitPermissionsCount();
      if (res.success && res.data !== undefined) setPendingCount(res.data);
    };

    loadPending();

    // Subscribe to all exit permission changes
    const exitChannel = dataService.subscribeToExitPermissions((payload) => {
      if (payload.eventType === 'INSERT') {
        setPendingCount(prev => prev + 1);
        // Toast is now handled by notifications table subscription to avoid duplicates
      } else if (payload.eventType === 'DELETE') {
        const oldRecord = payload.old;
        if (oldRecord && oldRecord.status === 'pending') {
          setPendingCount(prev => Math.max(0, prev - 1));
        }
      } else if (payload.eventType === 'UPDATE') {
        const oldStatus = payload.old?.status;
        const newStatus = payload.new?.status;

        if (oldStatus === 'pending' && newStatus !== 'pending') {
          setPendingCount(prev => Math.max(0, prev - 1));
        } else if (oldStatus !== 'pending' && newStatus === 'pending') {
          setPendingCount(prev => prev + 1);
        }
      }
    });

    // Subscribe to ALL personal notifications (newly added for real-time manager alerts)
    const notifChannel = dataService.subscribeToNotifications(currentUser.id, (payload) => {
      if (payload.eventType === 'INSERT') {
        toast.success(payload.new.message || 'Bạn có thông báo mới!');
      }
    });

    return () => {
      if (exitChannel) exitChannel.unsubscribe();
      if (notifChannel) notifChannel.unsubscribe();
    };
  }, [currentUser]);

  const loadUsers = async () => {
    const result = await dataService.getUsers({ status: 'active' });
    if (result.success && result.data) setAllUsers(result.data);
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);

    // Check for pending redirection
    const redirectPath = localStorage.getItem('redirect_after_login');
    if (redirectPath) {
      localStorage.removeItem('redirect_after_login');
      if (redirectPath.startsWith('/self-checkin/')) {
        const eventId = redirectPath.split('/')[2];
        if (eventId) {
          setSelectedEventId(eventId);
          setView('self-checkin');
          return;
        }
      }
    }

    setView('dashboard');
    loadUsers();
  };

  const handleLogout = () => {
    dataService.logout();
    setCurrentUser(null);
    setView('login');
  };

  const handleSelectEvent = (event: Event) => {
    setSelectedEvent(event);
    setView('checkin');
  };

  const handleCreateEvent = () => {
    setSelectedEvent(null);
    setView('event-form');
  };

  const handleEditEvent = (event: Event) => {
    setSelectedEvent(event);
    setView('event-form');
  };

  const handleEventSaved = () => {
    setView('events');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-20 h-20 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-6"></div>
          <h1 className="text-2xl font-black mb-2">EduCheck</h1>
          <p className="text-indigo-200">Đang tải hệ thống...</p>
        </div>
      </div>
    );
  }

  if (view === 'login' || !currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (view === 'checkin' && selectedEvent) {
    return <CheckinPage event={selectedEvent} currentUser={currentUser} onBack={() => setView('events')} />;
  }

  if (view === 'self-checkin' && selectedEventId) {
    return (
      <SelfCheckinPage
        eventId={selectedEventId}
        currentUser={currentUser}
        onLoginNeeded={() => setView('login')}
        onSuccess={() => setView('dashboard')}
        onBack={() => setView('dashboard')}
      />
    );
  }

  if (view === 'boarding-run') {
    return <BoardingCheckin currentUser={currentUser} onBack={() => window.close()} />;
  }

  if (view === 'event-form') {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto">
          <EventForm editingEvent={selectedEvent} onSave={handleEventSaved} onCancel={() => setView('events')} />
        </div>
      </div>
    );
  }

  // Student Portal Logic
  if (currentUser.role === 'student') {
    return (
      <StudentLayout currentUser={currentUser} onLogout={handleLogout} />
    );
  }

  const getMenuItems = (): MenuItem[] => {
    const baseItems: MenuItem[] = [
      { id: 'dashboard', icon: <Icons.Dashboard className="w-5 h-5" />, label: 'Dashboard' },
      { id: 'events', icon: <Icons.Events className="w-5 h-5" />, label: 'Sự kiện' },
    ];

    const boardingItems: MenuItem[] = [
      { id: 'divider1', icon: null, label: 'NỘI TRÚ', type: 'divider' },
      { id: 'boarding-config', icon: <Icons.Boarding className="w-5 h-5" />, label: 'Quản lý Nội trú' },
    ];

    const reportItems: MenuItem[] = [
      { id: 'divider2', icon: null, label: 'THỐNG KÊ', type: 'divider' },
      { id: 'ranking', icon: <Icons.Ranking className="w-5 h-5" />, label: 'Bảng xếp hạng' },
      { id: 'event-report', icon: <Icons.Reports className="w-5 h-5" />, label: 'Báo cáo sự kiện' },
      { id: 'points-stats', icon: <Icons.Dashboard className="w-5 h-5" />, label: 'Thống kê điểm' },
      { id: 'ai-analysis', icon: <Sparkles className="w-5 h-5" />, label: 'AI Phân tích' },
    ];

    const adminItems: MenuItem[] = [
      { id: 'divider3', icon: null, label: 'QUẢN TRỊ', type: 'divider' },
      { id: 'users', icon: <Icons.Users className="w-5 h-5" />, label: 'Người dùng' },
      { id: 'points', icon: <Icons.Points className="w-5 h-5" />, label: 'Quản lý điểm' },
      { id: 'certificates', icon: <Icons.Certificates className="w-5 h-5" />, label: 'Chứng nhận' },
      { id: 'cards', icon: <Icons.Cards className="w-5 h-5" />, label: 'Tạo thẻ' },
      { id: 'faceid', icon: <Icons.User className="w-5 h-5" />, label: 'Quản lý Face ID' },
      { id: 'permissions', icon: <Icons.Shield className="w-5 h-5" />, label: 'Phân quyền' },
      { id: 'settings', icon: <Icons.Settings className="w-5 h-5" />, label: 'Cấu hình' },
    ];

    const helpItems: MenuItem[] = [
      { id: 'divider-help', icon: null, label: 'HỖ TRỢ', type: 'divider' },
      { id: 'help', icon: <Icons.Info className="w-5 h-5" />, label: 'Hướng dẫn' },
    ];

    if (currentUser.role === 'admin') {
      return [...baseItems, ...boardingItems, ...reportItems, ...adminItems, ...helpItems];
    } else if (currentUser.role === 'teacher') {
      // DYNAMIC FILTERING FOR TEACHERS
      const enabledModules = teacherPermissions
        .filter(p => p.is_enabled)
        .map(p => p.module_id);

      // Map menu IDs to Permission IDs
      const hasPermission = (id: string) => {
        if (id === 'events') return enabledModules.includes('events');
        if (id === 'boarding-config') return enabledModules.includes('boarding');
        if (id === 'ranking' || id === 'event-report' || id === 'points-stats' || id === 'ai-analysis') return enabledModules.includes('reports');
        if (id === 'help') return enabledModules.includes('help');
        return enabledModules.includes(id);
      };

      const filteredBase = baseItems.filter(item =>
        item.id === 'dashboard' || hasPermission(item.id)
      );

      const filteredBoarding = boardingItems.filter(item =>
        item.type === 'divider' || hasPermission(item.id)
      );

      const filteredReports = reportItems.filter(item =>
        item.type === 'divider' || hasPermission(item.id)
      );

      const filteredAdmin = adminItems.filter(item =>
        item.type === 'divider' || hasPermission(item.id)
      );

      // Combine if groups have visible items (avoid empty dividers)
      const finalMenu: MenuItem[] = [...filteredBase];
      if (filteredBoarding.length > 1) finalMenu.push(...filteredBoarding);
      if (filteredReports.length > 1) finalMenu.push(...filteredReports);
      if (filteredAdmin.length > 1) finalMenu.push(...filteredAdmin);
      finalMenu.push(...helpItems);

      return finalMenu;

    } else {
      return [...baseItems, ...helpItems];
    }
  };


  const menuItems = getMenuItems();

  return (
    <div className="min-h-screen flex bg-slate-100 relative">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <aside className={`
        ${sidebarOpen ? 'w-64' : 'w-20'} 
        bg-slate-900 text-white min-h-screen flex flex-col transition-all duration-300 shadow-2xl z-50
        fixed inset-y-0 left-0 lg:relative
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="p-4 border-b border-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg text-white">
              <Icons.Shield className="w-6 h-6" />
            </div>
            {sidebarOpen && (
              <div>
                <h1 className="text-lg font-black tracking-tight">EduCheck</h1>
                <p className="text-xs text-slate-400 font-medium">v2.0 • AI Check-in</p>
              </div>
            )}
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-16 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center hover:bg-indigo-500 z-10 shadow-lg transition-colors text-white"
        >
          {sidebarOpen ? <Icons.ChevronLeft className="w-4 h-4" /> : <Icons.ChevronRight className="w-4 h-4" />}
        </button>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map(item => {
            if (item.type === 'divider') {
              return sidebarOpen ? (
                <div key={item.id} className="pt-5 pb-2">
                  <p className="text-xs text-slate-500 font-bold px-3 tracking-wider">{item.label}</p>
                </div>
              ) : (
                <div key={item.id} className="my-3 border-t border-slate-800"></div>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'boarding-config') {
                    setBoardingTab('dashboard');
                  }
                  setView(item.id as AppView);
                  setMobileMenuOpen(false); // Close on mobile after click
                }}
                className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center gap-3 transition-all group ${view === item.id
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                  }`}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {sidebarOpen && <span className="font-medium text-sm">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-slate-800/50">
          <div className={`flex items-center gap-3 ${sidebarOpen ? 'mb-3' : ''}`}>
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
              <span className="text-white font-black text-sm">{currentUser.full_name.charAt(0)}</span>
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setView('profile-admin')}>
                <p className="font-semibold text-sm truncate text-white hover:text-indigo-200 transition-colors">{currentUser.full_name}</p>
                <p className="text-xs text-slate-400 capitalize">{currentUser.role === 'admin' ? 'Quản trị viên' : 'Giáo viên'}</p>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2.5 bg-slate-800/50 hover:bg-red-600/80 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Icons.Logout className="w-5 h-5" />
              <span>Đăng xuất</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto">
        {/* Mobile Header */}
        <header className="lg:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <Icons.Menu className="w-6 h-6" />
            </button>
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white shadow-sm">
              <Icons.Shield className="w-4 h-4" />
            </div>
            <span className="font-black text-slate-800 tracking-tight">EduCheck</span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationList userId={currentUser.id} className="hover:bg-slate-100" />
            <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-slate-600">{currentUser.full_name.charAt(0)}</span>
            </div>
          </div>
        </header>

        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          {view === 'dashboard' && (
            <DashboardView
              setView={setView}
              currentUser={currentUser}
              pendingCount={pendingCount}
              setPendingCount={setPendingCount}
              setBoardingTab={setBoardingTab}
              teacherPermissions={teacherPermissions}
            />
          )}
          {view === 'events' && (
            <EventList
              onSelectEvent={handleSelectEvent}
              onCreateEvent={handleCreateEvent}
              onEditEvent={handleEditEvent}
              currentUser={currentUser!}
              teacherPermissions={teacherPermissions}
            />
          )}
          {view === 'ranking' && <RankingBoard />}
          {view === 'boarding-config' && (
            <BoardingConfigPage
              currentUser={currentUser}
              initialTab={boardingTab}
              teacherPermissions={teacherPermissions}
            />
          )}
          {view === 'event-report' && <EventReport />}
          {view === 'users' && <UserManagement />}
          {view === 'points' && <PointManagement />}
          {view === 'certificates' && <CertificateGenerator />}
          {view === 'cards' && <CardGenerator users={allUsers} />}
          {view === 'settings' && <SystemConfig />}
          {view === 'faceid' && <FaceIDManagement />}

          {view === 'points-stats' && <PointStatistics />}
          {view === 'ai-analysis' && <AIAnalysis currentUser={currentUser} />}
          {view === 'profile-admin' && <AdminProfile user={currentUser} />}
          {view === 'help' && <HelpCenter />}
          {view === 'permissions' && <PermissionSettings />}
        </div>
      </main>

      {/* Floating Help Button */}
      <div className="fixed bottom-6 right-6 z-[100]">
        <button
          onClick={() => setView('help')}
          className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-indigo-700 hover:scale-110 active:scale-95 transition-all group"
          title="Trung tâm Trợ giúp"
        >
          <Icons.Info className="w-7 h-7 group-hover:rotate-12 transition-transform" />
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
          )}
        </button>
      </div>
    </div>
  );
};

// ─── Animated number counter hook ─────────────────────────────────
const useAnimatedCount = (target: number, duration = 1200) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    let start = 0;
    const step = Math.max(1, Math.ceil(target / (duration / 16)));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
};

// ─── Live clock hook ──────────────────────────────────────────────
const useLiveClock = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return time;
};

// ─── Greeting based on hour ───────────────────────────────────────
const getGreeting = (hour: number) => {
  if (hour < 12) return { text: 'Chào buổi sáng', emoji: '☀️' };
  if (hour < 17) return { text: 'Chào buổi chiều', emoji: '🌤️' };
  if (hour < 21) return { text: 'Chào buổi tối', emoji: '🌙' };
  return { text: 'Khuya rồi', emoji: '🌟' };
};

// ─── Dashboard ────────────────────────────────────────────────────
const DashboardView: React.FC<{
  setView: (view: AppView) => void;
  currentUser: User;
  pendingCount: number;
  setPendingCount: (count: number) => void;
  setBoardingTab: (tab: any) => void;
  teacherPermissions: any[];
}> = ({ setView, currentUser, pendingCount, setPendingCount, setBoardingTab, teacherPermissions }) => {
  const [stats, setStats] = useState<{
    totalUsers: number;
    totalEvents: number;
    totalCheckins: number;
    todayCheckins: number;
  } | null>(null);
  const [recentEvents, setRecentEvents] = useState<Event[]>([]);

  const now = useLiveClock();
  const greeting = getGreeting(now.getHours());

  const hasPermission = (moduleId: string) => {
    if (currentUser.role === 'admin') return true;
    const perm = teacherPermissions.find((p: any) => p.module_id === moduleId);
    return perm ? perm.is_enabled : false;
  };

  useEffect(() => {
    const loadData = async () => {
      const [statsRes, eventsRes] = await Promise.all([
        dataService.getDashboardStats(),
        dataService.getEvents()
      ]);
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (eventsRes.success && eventsRes.data) setRecentEvents(eventsRes.data.slice(0, 3));
    };
    loadData();
  }, []);

  // Animated stats
  const animUsers = useAnimatedCount(stats?.totalUsers || 0);
  const animEvents = useAnimatedCount(stats?.totalEvents || 0);
  const animCheckins = useAnimatedCount(stats?.totalCheckins || 0);
  const animToday = useAnimatedCount(stats?.todayCheckins || 0);

  // Quick-access items
  const quickItems = [
    hasPermission('events') && {
      icon: <Icons.Events className="w-6 h-6" />,
      label: 'Sự kiện',
      desc: 'Quản lý check-in',
      color: 'from-indigo-500 to-blue-600',
      bg: 'bg-indigo-50',
      text: 'text-indigo-600',
      onClick: () => setView('events')
    },
    hasPermission('boarding') && {
      icon: <Icons.Boarding className="w-6 h-6" />,
      label: 'Nội trú',
      desc: 'Điểm danh & Quản lý',
      color: 'from-emerald-500 to-teal-600',
      bg: 'bg-emerald-50',
      text: 'text-emerald-600',
      onClick: () => { setBoardingTab('dashboard'); setView('boarding-config'); }
    },
    hasPermission('reports') && {
      icon: <Icons.Reports className="w-6 h-6" />,
      label: 'Báo cáo',
      desc: 'Thống kê & Phân tích',
      color: 'from-amber-500 to-orange-600',
      bg: 'bg-amber-50',
      text: 'text-amber-600',
      onClick: () => setView('event-report')
    },
    hasPermission('reports') && {
      icon: <Icons.Ranking className="w-6 h-6" />,
      label: 'Bảng xếp hạng',
      desc: 'Top học sinh xuất sắc',
      color: 'from-purple-500 to-violet-600',
      bg: 'bg-purple-50',
      text: 'text-purple-600',
      onClick: () => setView('ranking')
    },
    currentUser.role === 'admin' && {
      icon: <Icons.Users className="w-6 h-6" />,
      label: 'Người dùng',
      desc: 'Quản lý tài khoản',
      color: 'from-pink-500 to-rose-600',
      bg: 'bg-pink-50',
      text: 'text-pink-600',
      onClick: () => setView('users')
    },
    hasPermission('certificates') && {
      icon: <Icons.Certificates className="w-6 h-6" />,
      label: 'Chứng nhận',
      desc: 'Tạo giấy chứng nhận',
      color: 'from-cyan-500 to-blue-600',
      bg: 'bg-cyan-50',
      text: 'text-cyan-600',
      onClick: () => setView('certificates')
    },
    hasPermission('cards') && {
      icon: <Icons.Cards className="w-6 h-6" />,
      label: 'Tạo thẻ',
      desc: 'Thẻ QR định danh',
      color: 'from-violet-500 to-purple-600',
      bg: 'bg-violet-50',
      text: 'text-violet-600',
      onClick: () => setView('cards')
    },
    currentUser.role === 'admin' && {
      icon: <Icons.Settings className="w-6 h-6" />,
      label: 'Cấu hình',
      desc: 'Thiết lập hệ thống',
      color: 'from-slate-500 to-slate-700',
      bg: 'bg-slate-100',
      text: 'text-slate-600',
      onClick: () => setView('settings')
    },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; desc: string; color: string; bg: string; text: string; onClick: () => void }[];

  return (
    <div className="space-y-6">
      {/* ── Welcome Banner ── */}
      <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-2xl md:rounded-3xl p-6 md:p-8 text-white relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/4 blur-2xl"></div>
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.03%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50"></div>

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{greeting.emoji}</span>
              <p className="text-white/80 font-medium">{greeting.text},</p>
            </div>
            <h2 className="text-2xl md:text-3xl font-black">{currentUser.full_name}!</h2>
            <p className="text-white/60 mt-2 text-sm">
              {now.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Clock */}
            <div className="hidden md:flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-2xl px-5 py-3 border border-white/20">
              <Icons.Clock className="w-5 h-5 text-white/80" />
              <span className="text-2xl font-black tabular-nums tracking-wider">
                {now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            {/* Notification Bell */}
            <button
              onClick={() => {
                setPendingCount(0);
                setBoardingTab('exit');
                setView('boarding-config');
              }}
              className="relative p-3 md:p-4 bg-white/15 backdrop-blur-md rounded-2xl hover:bg-white/25 transition-all border border-white/20 group shadow-xl"
            >
              <div className="relative">
                <Icons.Bell className="w-6 h-6 md:w-7 md:h-7 text-white group-hover:animate-bounce" />
                {pendingCount > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-[20px] h-[20px] px-1 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white/80 animate-pulse shadow-lg">
                    {pendingCount}
                  </span>
                )}
              </div>
              <p className="text-[9px] font-bold uppercase opacity-70 mt-1 text-center leading-tight">Đơn phép</p>
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={<Icons.Users className="w-5 h-5 md:w-6 md:h-6" />} label="Người dùng" value={animUsers} color="indigo" accent="bg-indigo-500" />
        <StatCard icon={<Icons.Events className="w-5 h-5 md:w-6 md:h-6" />} label="Sự kiện" value={animEvents} color="emerald" accent="bg-emerald-500" />
        <StatCard icon={<Icons.CheckIn className="w-5 h-5 md:w-6 md:h-6" />} label="Tổng check-in" value={animCheckins} color="amber" accent="bg-amber-500" />
        <StatCard icon={<Icons.CheckIn className="w-5 h-5 md:w-6 md:h-6" />} label="Hôm nay" value={animToday} color="purple" accent="bg-purple-500" highlight />
      </div>

      {/* ── Main Content Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Quick Access (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Actions Grid */}
          <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 p-5 md:p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Icons.Dashboard className="w-4 h-4 text-white" />
                </span>
                Truy cập nhanh
              </h3>
              <span className="text-xs text-slate-400 font-medium">{quickItems.length} tính năng</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {quickItems.map((item, i) => (
                <button
                  key={i}
                  onClick={item.onClick}
                  className="group bg-slate-50/80 hover:bg-white rounded-2xl p-4 text-left transition-all hover:shadow-lg hover:-translate-y-0.5 border border-transparent hover:border-slate-200 active:scale-[0.97]"
                >
                  <div className={`w-11 h-11 ${item.bg} rounded-xl flex items-center justify-center ${item.text} mb-3 group-hover:scale-110 transition-transform`}>
                    {item.icon}
                  </div>
                  <p className="font-bold text-slate-900 text-sm truncate">{item.label}</p>
                  <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* AI Analysis Quick entry (only admin) */}
          {currentUser.role === 'admin' && (
            <button
              onClick={() => setView('ai-analysis')}
              className="w-full bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 rounded-2xl p-5 text-left text-white relative overflow-hidden group hover:shadow-xl hover:shadow-purple-200 transition-all active:scale-[0.99]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
              <div className="relative z-10 flex items-center gap-4">
                <div className="w-12 h-12 bg-white/15 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/20">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-lg">AI Phân tích thông minh</p>
                  <p className="text-white/70 text-sm mt-0.5">Phân tích xu hướng, đưa ra đề xuất với trí tuệ nhân tạo</p>
                </div>
                <Icons.ChevronRight className="w-5 h-5 text-white/60 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          )}
        </div>

        {/* Right: Recent Events (1 col) */}
        <div className="space-y-6">
          {/* Recent Events */}
          <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-slate-900 flex items-center gap-2">
                <Icons.Events className="w-5 h-5 text-indigo-500" />
                Sự kiện gần đây
              </h3>
              {hasPermission('events') && (
                <button
                  onClick={() => setView('events')}
                  className="text-xs text-indigo-600 font-bold hover:text-indigo-700 flex items-center gap-1"
                >
                  Xem tất cả
                  <Icons.ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="divide-y divide-slate-50">
              {recentEvents.length === 0 ? (
                <div className="p-8 text-center">
                  <Icons.Events className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400 font-medium">Chưa có sự kiện</p>
                </div>
              ) : (
                recentEvents.map(event => {
                  // Compute real status from time, not just DB field
                  const now = new Date();
                  const startTime = event.start_time ? new Date(event.start_time) : null;
                  const endTime = event.end_time ? new Date(event.end_time) : null;

                  let realStatus: 'upcoming' | 'active' | 'completed' = 'upcoming';
                  if (event.status === 'completed' || (endTime && now > endTime)) {
                    realStatus = 'completed';
                  } else if (event.status === 'active' || (startTime && now >= startTime && (!endTime || now <= endTime))) {
                    realStatus = 'active';
                  }

                  const statusColor = realStatus === 'active' ? 'bg-emerald-100 text-emerald-700' : realStatus === 'upcoming' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500';
                  const statusLabel = realStatus === 'active' ? 'Đang diễn ra' : realStatus === 'upcoming' ? 'Chờ bắt đầu' : 'Đã kết thúc';
                  const eventDate = startTime;

                  return (
                    <button
                      key={event.id}
                      onClick={() => hasPermission('events') && setView('events')}
                      className="w-full px-5 py-3.5 hover:bg-slate-50 transition-colors text-left flex items-start gap-3 group"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${realStatus === 'active' ? 'bg-emerald-100 text-emerald-600' : realStatus === 'upcoming' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Icons.Events className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-slate-900 truncate group-hover:text-indigo-600 transition-colors">{event.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor}`}>{statusLabel}</span>
                          {eventDate && (
                            <span className="text-[10px] text-slate-400 font-medium">
                              {eventDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* System Status */}
          <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 p-5">
            <h3 className="font-black text-slate-900 mb-4 flex items-center gap-2 text-sm">
              <Icons.Shield className="w-5 h-5 text-emerald-500" />
              Trạng thái hệ thống
            </h3>
            <div className="space-y-3">
              {[
                { label: 'Kết nối Database', ok: true },
                { label: 'Hệ thống Check-in', ok: true },
                { label: 'AI Face Recognition', ok: true },
                { label: 'Push Notifications', ok: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 font-medium">{item.label}</span>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${item.ok ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`}></div>
                    <span className={`text-xs font-bold ${item.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                      {item.ok ? 'Hoạt động' : 'Lỗi'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 font-medium">
                Phiên bản: EduCheck v2.0 • Cập nhật: {new Date().toLocaleDateString('vi-VN')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Stat Card with gradient accent ───────────────────────────────
const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number; color: string; accent: string; highlight?: boolean }> = ({ icon, label, value, color, accent, highlight }) => {
  const gradients: Record<string, string> = {
    indigo: 'from-indigo-500 to-indigo-600',
    emerald: 'from-emerald-500 to-emerald-600',
    amber: 'from-amber-500 to-amber-600',
    purple: 'from-purple-500 to-purple-600',
  };

  return (
    <div className={`bg-white rounded-2xl p-4 md:p-5 shadow-sm border transition-all hover:shadow-md hover:-translate-y-0.5 ${highlight ? 'border-purple-200 ring-1 ring-purple-100' : 'border-slate-100'} relative overflow-hidden`}>
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradients[color]}`}></div>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-wider">{label}</p>
          <p className="text-2xl md:text-3xl font-black text-slate-900 mt-1 tabular-nums">{value.toLocaleString()}</p>
        </div>
        <div className={`w-10 h-10 md:w-11 md:h-11 rounded-xl bg-gradient-to-br ${gradients[color]} flex items-center justify-center text-white shadow-lg`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

export default App;
