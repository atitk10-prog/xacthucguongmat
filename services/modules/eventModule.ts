/**
 * Event Module - Events, Participants & Check-in
 * Re-exports event-related functions from dataService
 */
import { dataService } from '../dataService';

export const eventService = {
    // Events CRUD
    getEvents: dataService.getEvents,
    getEventsWithCounts: dataService.getEventsWithCounts,
    getEvent: dataService.getEvent,
    createEvent: dataService.createEvent,
    updateEvent: dataService.updateEvent,
    deleteEvent: dataService.deleteEvent,

    // Check-in
    checkin: dataService.checkin,
    getEventCheckins: dataService.getEventCheckins,

    // Participants
    getEventParticipants: dataService.getEventParticipants,
    getEventParticipantCount: dataService.getEventParticipantCount,
    getEventCheckedInCount: dataService.getEventCheckedInCount,
    updateParticipantFaceDescriptor: dataService.updateParticipantFaceDescriptor,
    uploadParticipantAvatarWithFaceID: dataService.uploadParticipantAvatarWithFaceID,
    saveEventParticipants: dataService.saveEventParticipants,
    deleteEventParticipant: dataService.deleteEventParticipant,
    computeAndSaveParticipantFaceDescriptor: dataService.computeAndSaveParticipantFaceDescriptor,

    // Absent Processing
    processEventAbsence: dataService.processEventAbsence
};

export default eventService;
