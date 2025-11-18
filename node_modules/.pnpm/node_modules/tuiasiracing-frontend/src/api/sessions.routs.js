import apiClient from "./apiClient";

export const getSessions = () => {
    return apiClient.get("api/sessions");
};

export const getSessionById = (id) => {
    return apiClient.get(`api/sessions/${id}`);
};

export const createSession = (sessionData) => {
    return apiClient.post("api/sessions", sessionData);
};

export const updateSession = (id, sessionData) => {
    return apiClient.put(`api/monoposts/${id}`, sessionData);
};

export const deleteSession = (id) => {
    return apiClient.delete(`api/sessions/${id}`);
};
