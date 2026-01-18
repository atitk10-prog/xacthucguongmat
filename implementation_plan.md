# Implementation Plan - Refine Recognition and Check-in UX

Addressing user feedback to eliminate "ghost" detections (single person detected as multiple), switch to using user avatars for display instead of captured check-in photos, and ensure user details are viewable.

## Problem Description
1.  **Ghost Multi-Detection:** One person is sometimes detected as two people, or falsely identified as another user (ghosting), even at 40% threshold.
2.  **Image Display:** The system currently saves and displays the "captured image" from the check-in moment. The user wants to display the **stored avatar** (image card) instead and **NOT SAVE** the check-in image to the database.
3.  **User Details:** Clicking on a user in the list need to show their full details.

## Proposed Changes

### Component: `CheckinPage.tsx`

#### [MODIFY] [CheckinPage.tsx](file:///c:/Users/Hii/Desktop/GITHUB/xacthucguongmat/components/checkin/CheckinPage.tsx)

1.  **Strict "Best Match" Only:**
    *   **Logic:** If multiple faces are detected, **only process the largest face** (the one closest/clearest). This prevents background noise or partial reflections from triggering false positives.
    *   **Threshold:** Increase default sensitivity/threshold further (to 50% or 55%) to really filter out weak matches.

2.  **Use Avatar for Display:**
    *   **Logic:** When adding to `recentCheckins` list, use the `participant.avatar_url` (from `participants` lookup) instead of the captured video frame.
    *   **Database:** Update `handleCheckIn` to passing `null` or empty string for the image field when calling `dataService.checkInEvent`, effectively disabling image saving.

3.  **Click to View Details:**
    *   **Logic:** Ensure the `recentCheckins` items have an `onClick` handler that sets `selectedUser` state, opening the detail modal (which presumably already exists or needs verification).

### Component: `dataService.ts`

#### [MODIFY] [dataService.ts](file:///c:/Users/Hii/Desktop/GITHUB/xacthucguongmat/services/dataService.ts)

1.  **Disable Image Upload (Optional but cleaner):**
    *   Verify `checkInEvent` handles missing image gracefully.

## Verification Plan

### Manual Verification
1.  **Ghost Test:** Stand alone. Verify ONLY 1 face box appears. Verify name is correct or "Unknown".
2.  **Display Test:** Check-in. Verify the image in the right sidebar is your **registered avatar**, not the webcam snapshot.
3.  **Database Test:** Check Supabase `checkins` table. The `image_url` (or equivalent) column should be empty/null (or we just don't display it).
