/**
 * User Module - User Management & Face ID
 * Re-exports user-related functions from dataService
 */
import { dataService } from '../dataService';

export const userService = {
    // CRUD
    getUsers: dataService.getUsers,
    getUser: dataService.getUser,
    createUser: dataService.createUser,
    updateUser: dataService.updateUser,
    deleteUser: dataService.deleteUser,

    // Face ID
    getFaceDescriptors: dataService.getFaceDescriptors,
    batchComputeFaceDescriptors: dataService.batchComputeFaceDescriptors,
    computeAndSaveFaceDescriptor: dataService.computeAndSaveFaceDescriptor,
    onFaceComputeComplete: dataService.onFaceComputeComplete,
    getFaceComputeStatus: dataService.getFaceComputeStatus,
    getPendingFaceComputes: dataService.getPendingFaceComputes,
    getAllStudentsForCheckin: dataService.getAllStudentsForCheckin
};

export default userService;
