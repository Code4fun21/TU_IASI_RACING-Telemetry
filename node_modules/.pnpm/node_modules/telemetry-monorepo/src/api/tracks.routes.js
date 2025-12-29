import apiClient from "./apiClient";

export const getTracks = () => {
    return apiClient.get("api/tracks");
};

export const getTrackById = (id) => {
    return apiClient.get(`api/tracks/${id}`);
};

export const createTrack = (trackData) => {
    return apiClient.post("api/tracks", trackData);
};

export const updateTrack = (id, trackData) => {
    return apiClient.put(`api/tracks/${id}`, trackData);
};

// export const deleteTrack = (id) => {
//     return apiClient.delete(`api/tracks/${id}`);
// };
