/**
 * EduCheck Service Modules - Domain-specific API facades
 * 
 * Usage: Import the specific module instead of the monolithic dataService
 * 
 * Example:
 *   import { authService } from '../../services/modules';
 *   import { eventService } from '../../services/modules';
 * 
 * The original `dataService` import still works for backward compatibility:
 *   import { dataService } from '../../services/dataService';
 */

export { authService } from './authModule';
export { userService } from './userModule';
export { eventService } from './eventModule';
export { boardingService } from './boardingModule';
export { reportService } from './reportModule';
export { certService } from './certModule';
