/**
 * Boarding Module - Boarding Check-in, Rooms, Time Slots & Config
 * Re-exports boarding-related functions from dataService
 */
import { dataService } from '../dataService';

export const boardingService = {
    // Boarding Check-in
    boardingCheckin: dataService.boardingCheckin,
    getBoardingCheckins: dataService.getBoardingCheckins,
    getRecentBoardingActivity: dataService.getRecentBoardingActivity,
    getRecentBoardingLogs: dataService.getRecentBoardingLogs,

    // Config
    getBoardingConfig: dataService.getBoardingConfig,
    updateBoardingConfig: dataService.updateBoardingConfig,

    // Rooms & Zones
    getRooms: dataService.getRooms,
    createRoom: dataService.createRoom,
    updateRoom: dataService.updateRoom,
    deleteRoom: dataService.deleteRoom,
    updateZone: dataService.updateZone,
    getZones: dataService.getZones,

    // Time Slots
    getTimeSlots: dataService.getTimeSlots,
    getActiveTimeSlots: dataService.getActiveTimeSlots,
    createTimeSlot: dataService.createTimeSlot,
    updateTimeSlot: dataService.updateTimeSlot,
    deleteTimeSlot: dataService.deleteTimeSlot,
    getCurrentTimeSlot: dataService.getCurrentTimeSlot,
    calculateCheckinStatus: dataService.calculateCheckinStatus,

    // Teacher Permissions
    getTeacherPermissions: dataService.getTeacherPermissions,
    subscribeToTeacherPermissions: dataService.subscribeToTeacherPermissions,
    updateTeacherPermission: dataService.updateTeacherPermission,

    // Exit Permissions
    getExitPermissions: dataService.getExitPermissions,
    createExitPermission: dataService.createExitPermission,
    updateExitPermission: dataService.updateExitPermission,
    approveRejectExitPermission: dataService.approveRejectExitPermission,
    deleteExitPermission: dataService.deleteExitPermission,
    subscribeToExitPermissions: dataService.subscribeToExitPermissions,
    getPendingExitPermissionsCount: dataService.getPendingExitPermissionsCount,

    // Absent & Late
    processAbsentStudents: dataService.processAbsentStudents,
    getLateStudents: dataService.getLateStudents,
    processLateStudents: dataService.processLateStudents,

    // Offline Sync
    syncOfflineData: dataService.syncOfflineData,
    getOfflineQueueLength: dataService.getOfflineQueueLength
};

export default boardingService;
