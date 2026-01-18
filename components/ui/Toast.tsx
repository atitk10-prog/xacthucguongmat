import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Icons } from './AppIcons';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    addToast: (message: string, type: ToastType) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: ToastType) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { id, message, type }]);

        // Auto remove after 3 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    }, []);

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const success = (msg: string) => addToast(msg, 'success');
    const error = (msg: string) => addToast(msg, 'error');
    const info = (msg: string) => addToast(msg, 'info');

    return (
        <ToastContext.Provider value={{ addToast, success, error, info }}>
            {children}
            {/* Toast Container */}
            <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`
                            pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl transform transition-all duration-300 ease-in-out animate-in slide-in-from-right-full
                            ${toast.type === 'success' ? 'bg-white border-l-4 border-emerald-500 text-slate-800' : ''}
                            ${toast.type === 'error' ? 'bg-white border-l-4 border-red-500 text-slate-800' : ''}
                            ${toast.type === 'info' ? 'bg-white border-l-4 border-blue-500 text-slate-800' : ''}
                        `}
                        style={{ minWidth: '300px' }}
                    >
                        <div className={`
                            p-1 rounded-full 
                            ${toast.type === 'success' ? 'bg-emerald-100 text-emerald-600' : ''}
                            ${toast.type === 'error' ? 'bg-red-100 text-red-600' : ''}
                            ${toast.type === 'info' ? 'bg-blue-100 text-blue-600' : ''}
                         `}>
                            {toast.type === 'success' && <Icons.Check className="w-5 h-5" />}
                            {toast.type === 'error' && <Icons.X className="w-5 h-5" />}
                            {toast.type === 'info' && <Icons.Search className="w-5 h-5" />}
                        </div>
                        <p className="flex-1 font-medium text-sm">{toast.message}</p>
                        <button onClick={() => removeToast(toast.id)} className="text-slate-400 hover:text-slate-600 transition-colors">
                            <Icons.X className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
