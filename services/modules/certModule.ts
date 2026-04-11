/**
 * Certificate Module - Certificates & Configs
 * Re-exports certificate-related functions from dataService
 */
import { dataService } from '../dataService';

export const certService = {
    getCertificates: dataService.getCertificates,
    getCertificateById: dataService.getCertificateById,
    getTopStudentsByMonth: dataService.getTopStudentsByMonth,
    createCertificate: dataService.createCertificate,
    createCertificatesBulk: dataService.createCertificatesBulk,
    deleteCertificate: dataService.deleteCertificate,
    getCertificateConfigs: dataService.getCertificateConfigs,
    saveCertificateConfig: dataService.saveCertificateConfig,
    deleteCertificateConfig: dataService.deleteCertificateConfig,
    countCertificatesByConfig: dataService.countCertificatesByConfig
};

export default certService;
