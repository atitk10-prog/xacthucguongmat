/**
 * Auth Module - Authentication & Token Management
 * Re-exports auth-related functions from dataService
 */
import { dataService } from '../dataService';

export const authService = {
    login: dataService.login,
    register: dataService.register,
    getMe: dataService.getMe,
    logout: dataService.logout,
    isAuthenticated: dataService.isAuthenticated,
    getToken: dataService.getToken,
    getStoredUser: dataService.getStoredUser,
    storeUser: dataService.storeUser,
    hashPassword: dataService.hashPassword,
    GUEST_STAFF_TOKEN: dataService.GUEST_STAFF_TOKEN
};

export default authService;
