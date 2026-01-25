import React, { useState, useEffect } from 'react';
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
  | 'reports' | 'event-report' | 'ranking' | 'points-stats'
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

        if (staffToken === 'EDUCHECK_STAFF' || (storedUser && dataService.isAuthenticated())) {
          if (staffToken === 'EDUCHECK_STAFF' && !storedUser) {
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
          if (staffToken === 'EDUCHECK_STAFF') {
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
        if (id === 'ranking' || id === 'event-report' || id === 'points-stats') return enabledModules.includes('reports');
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
          {view === 'reports' && <EventReport />}
          {view === 'points-stats' && <PointStatistics />}
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
          {pendingCount === 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
          )}
        </button>
      </div>
    </div>
  );
};

// Dashboard
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

  const hasPermission = (moduleId: string) => {
    if (currentUser.role === 'admin') return true;
    const perm = teacherPermissions.find(p => p.module_id === moduleId);
    return perm ? perm.is_enabled : false;
  };

  useEffect(() => {
    const loadStats = async () => {
      const result = await dataService.getDashboardStats();
      if (result.success && result.data) setStats(result.data);
    };
    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-2xl md:rounded-3xl p-6 md:p-8 text-white relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="relative z-10">
          <p className="text-white/70 font-medium">Chào mừng trở lại,</p>
          <h2 className="text-2xl md:text-3xl font-black mt-1">{currentUser.full_name}!</h2>
          <p className="text-white/70 mt-2 text-sm md:text-base">
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Admin Dashboard Bell */}
        <button
          onClick={() => {
            setPendingCount(0);
            setBoardingTab('exit');
            setView('boarding-config');
          }}
          className="relative z-10 p-3 md:p-4 bg-white/20 backdrop-blur-md rounded-2xl hover:bg-white/30 transition-all border border-white/30 group shadow-xl flex items-center gap-3 md:block"
        >
          <div className="relative">
            <Icons.Bell className="w-6 h-6 md:w-8 md:h-8 text-white group-hover:animate-bounce" />
            {pendingCount > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] md:min-w-[24px] md:h-[24px] px-1 bg-red-500 text-white text-[10px] md:text-xs font-black rounded-full flex items-center justify-center border-2 md:border-4 border-white animate-pulse">
                {pendingCount}
              </span>
            )}
          </div>
          <div className="text-left md:text-center mt-0 md:mt-1">
            <p className="text-[10px] font-bold uppercase opacity-80 leading-tight">Đơn xin phép</p>
            <p className="md:hidden text-[10px] opacity-60">Xem chi tiết</p>
          </div>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={<Icons.Users className="w-5 h-5 md:w-6 md:h-6" />} label="Tổng người dùng" value={stats?.totalUsers || 0} color="indigo" />
        <StatCard icon={<Icons.Events className="w-5 h-5 md:w-6 md:h-6" />} label="Tổng sự kiện" value={stats?.totalEvents || 0} color="emerald" />
        <StatCard icon={<Icons.CheckIn className="w-5 h-5 md:w-6 md:h-6" />} label="Tổng check-in" value={stats?.totalCheckins || 0} color="amber" />
        <StatCard icon={<Icons.CheckIn className="w-5 h-5 md:w-6 md:h-6" />} label="Check-in hôm nay" value={stats?.todayCheckins || 0} color="purple" />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-slate-100">
        <h3 className="text-lg font-black text-slate-900 mb-4">Thao tác nhanh</h3>
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 md:gap-3">
          {hasPermission('events') && <QuickButton icon={<Icons.Events className="w-5 h-5" />} label="Quản lý sự kiện" onClick={() => setView('events')} color="indigo" />}
          {hasPermission('boarding') && <QuickButton icon={<Icons.Boarding className="w-5 h-5" />} label="Quản lý Nội trú" onClick={() => { setBoardingTab('dashboard'); setView('boarding-config'); }} color="emerald" />}
          {hasPermission('reports') && <QuickButton icon={<Icons.Ranking className="w-5 h-5" />} label="Bảng xếp hạng" onClick={() => setView('ranking')} color="purple" />}
          {currentUser.role === 'admin' && (
            <>
              <QuickButton icon={<Icons.Users className="w-5 h-5" />} label="Quản lý người dùng" onClick={() => setView('users')} color="pink" />
              <QuickButton icon={<Icons.Points className="w-5 h-5" />} label="Quản lý điểm" onClick={() => setView('points')} color="amber" />
            </>
          )}
        </div>
      </div>

      {/* Feature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {hasPermission('boarding') && <FeatureCard icon={<Icons.Boarding className="w-6 h-6" />} title="Nội trú" desc="Quản lý tổng hợp" onClick={() => { setBoardingTab('dashboard'); setView('boarding-config'); }} />}
        {hasPermission('reports') && <FeatureCard icon={<Icons.Reports className="w-6 h-6" />} title="Báo cáo" desc="Thống kê check-in" onClick={() => setView('event-report')} />}
        {hasPermission('certificates') && <FeatureCard icon={<Icons.Certificates className="w-6 h-6" />} title="Chứng nhận" desc="Tạo giấy chứng nhận" onClick={() => setView('certificates')} />}
        {hasPermission('cards') && <FeatureCard icon={<Icons.Cards className="w-6 h-6" />} title="Tạo thẻ" desc="Thẻ QR học sinh" onClick={() => setView('cards')} />}
        {hasPermission('settings') && <FeatureCard icon={<Icons.Settings className="w-6 h-6" />} title="Cấu hình" desc="Thiết lập hệ thống" onClick={() => setView('settings')} />}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number; color: string }> = ({ icon, label, value, color }) => {
  const colors: Record<string, string> = {
    indigo: 'from-indigo-500 to-indigo-600',
    emerald: 'from-emerald-500 to-emerald-600',
    amber: 'from-amber-500 to-amber-600',
    purple: 'from-purple-500 to-purple-600',
  };

  return (
    <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-slate-100">
      <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center text-white mb-3`}>
        {icon}
      </div>
      <p className="text-slate-500 text-[10px] md:text-sm font-medium">{label}</p>
      <p className="text-xl md:text-2xl font-black text-slate-900 mt-0.5">{value}</p>
    </div>
  );
};

const QuickButton: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; color: string }> = ({ icon, label, onClick, color }) => {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-600 hover:bg-indigo-700',
    emerald: 'bg-emerald-600 hover:bg-emerald-700',
    amber: 'bg-amber-600 hover:bg-amber-700',
    purple: 'bg-purple-600 hover:bg-purple-700',
    pink: 'bg-pink-600 hover:bg-pink-700',
  };

  return (
    <button
      onClick={onClick}
      className={`px-4 md:px-5 py-2.5 ${colors[color]} text-white rounded-xl font-bold md:font-semibold flex items-center justify-center md:justify-start gap-2 transition-all active:scale-95 sm:hover:scale-105 shadow-md overflow-hidden`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="text-sm truncate">{label}</span>
    </button>
  );
};

const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; desc: string; onClick: () => void }> = ({ icon, title, desc, onClick }) => (
  <button onClick={onClick} className="bg-white rounded-2xl p-4 md:p-5 shadow-sm text-left hover:shadow-lg hover:-translate-y-1 transition-all group overflow-hidden border border-slate-100">
    <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 mb-3 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
      {icon}
    </div>
    <h3 className="font-bold text-slate-900 truncate text-sm md:text-base">{title}</h3>
    <p className="text-slate-500 text-xs md:text-sm truncate">{desc}</p>
  </button>
);

export default App;
