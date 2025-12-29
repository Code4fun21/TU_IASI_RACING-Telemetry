import apiClient from "./apiClient";

export const getDrivers = () => {
    return apiClient.get("api/drivers");
};

export const getDriverById = (id) => {
    return apiClient.get(`api/drivers/${id}`);
};

export const createDriver = (driverData) => {
    return apiClient.post("api/drivers", driverData);
};

export const updateDriver = (id, driverData) => {
    return apiClient.put(`api/drivers/${id}`, driverData);
};

export const deleteDriver = (id) => {
    return apiClient.delete(`api/drivers/${id}`);
};
