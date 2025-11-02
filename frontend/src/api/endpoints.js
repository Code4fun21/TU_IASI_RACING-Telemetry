import apiClient from "./apiClient";

export const connectToTelemetry = (data) => {
    // The endpoint should match the one defined in your Express backend
    return apiClient.post(`telemetry/connect`, data);
};

export const createCsv = () => {
    return apiClient.post("create-csv", { files: "data.csv,data1.csv,data.csv" });
};

export const addFile = () => {
    return apiClient.get(`add-file?path=data.csv`);
};

export const createTable = () => {
    return apiClient.get(`create-table?file_no=0`);
};

export const getTable = () => {
    return apiClient.get(`get-table?file_no=0`);
};

export const getData = () => {
    return apiClient.get(`get-data`);
};

export const getFiles = () => {
    return apiClient.get(`api/sessions`);
};

export const getFileData = (fileName,gates,coordinates) => {
    return apiClient.post("create-csv", {"files": fileName,"gates":gates,"trackCoordonates":coordinates});
};

//mqtt
export const startMqtt = (data) => {
    return apiClient.post(`/create-mqtt`, data);
};

export const startTelemetry = (payload) =>
  apiClient.post("start", payload);

