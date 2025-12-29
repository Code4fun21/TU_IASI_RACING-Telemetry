import apiClient from "./apiClient";

export const getMonoposts = () => {
    return apiClient.get("api/monoposts");
};

export const getMonopostById = (id) => {
    return apiClient.get(`api/monoposts/${id}`);
};

export const createMonopost = (monopostData) => {
    return apiClient.post("api/monoposts", monopostData);
};

export const updateMonopost = (id, monopostData) => {
    return apiClient.put(`api/monoposts/${id}`, monopostData);
};

export const deleteMonopost = (id) => {
    return apiClient.delete(`api/monoposts/${id}`);
};
