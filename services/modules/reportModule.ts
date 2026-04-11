/**
 * Report Module - Reports, Rankings, Points & Notifications
 * Re-exports report-related functions from dataService
 */
import { dataService } from '../dataService';

export const reportService = {
    // Reports
    getEventReport: dataService.getEventReport,
    getDashboardStats: dataService.getDashboardStats,

    // Ranking
    getRanking: dataService.getRanking,

    // Points
    getPointLogs: dataService.getPointLogs,
    addPoints: dataService.addPoints,
    deductPoints: dataService.deductPoints,
    getPointStatistics: dataService.getPointStatistics,
    getDetailedPointLogs: dataService.getDetailedPointLogs,

    // Notifications
    getNotifications: dataService.getNotifications,
    markNotificationsRead: dataService.markNotificationsRead,
    subscribeToNotifications: dataService.subscribeToNotifications,

    // System Config
    getConfigs: dataService.getConfigs,
    updateConfig: dataService.updateConfig,
    initSystem: dataService.initSystem,

    // Cache
    clearCache: dataService.clearCache
};

export default reportService;
