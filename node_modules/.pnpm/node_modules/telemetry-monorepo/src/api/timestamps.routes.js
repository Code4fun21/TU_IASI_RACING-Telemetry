import apiClient from "./apiClient";

// CREATE
export const createTimestamp = (data) => {
    // Expected data shape:
    // { startTime, endTime, driverId, setupId, sessionsId }
    return apiClient.post("/api/timestamps", data);
};

// LIST / GET ALL
export const getTimestamps = (column, value) => {
    return apiClient.get(`/api/timestamps/${column}?value=${value}`);
};

// UPDATE
export const updateTimestamp = (id, data) => {
    return apiClient.put(`/api/timestamps/${id}`, data);
};

// DELETE
export const deleteTimestamp = (id) => {
    return apiClient.delete(`/api/timestamps/${id}`);
};
