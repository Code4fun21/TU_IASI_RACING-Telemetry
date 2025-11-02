import { addFile, createCsv, createTable, getFiles } from "./api/endpoints";
import "./App.css";
import backgroundImage from "./assets/cool-background.png";
import logo from "./assets/tuiasilogo.png";
import { useNavigate } from "react-router-dom";

function Home() {
    let navigate = useNavigate();

    const onClickReadFile = async () => {
        // await createCsv().then(async (response) => {
        //     console.log("Create csv", response);
        //     await createTable().then((response) => {
        //         console.log("Create table", response);

        //     });
        // });
        // await addFile().then((response) => {
        //     console.log("Add file", response);
        // });
        const sessions = await getFiles().then((response) => {
            console.log("Create table", response?.data);
            return response?.data;
        });

        navigate("/offline-files", { state: { files: sessions } });
    };

    const onClickReadLive = async () => {
        // await startMqtt().then((response) => {
        //     console.log("Start mqtt", response);
        // });
        navigate("/mqtt-auth");
    }

    return (
        <>
            <div
                className="flex h-screen items-center justify-center bg-cover bg-center bg-no-repeat px-6 py-12"
                style={{ backgroundImage: `url(${backgroundImage})` }}
            >
                <div className="w-full max-w-sm bg-gray-800/75 rounded-lg p-6 shadow-lg">
                    <img alt="Your Company" src={logo} className="mx-auto h-10 w-auto" />
                    <h2 className="mt-10 text-center text-2xl/9 font-bold tracking-tight text-white"></h2>

                    <div className="mt-10 space-y-6">
                        <div>
                            <button
                                type="submit"
                                onClick={onClickReadLive}
                                className="flex w-full justify-center rounded-md bg-red-500 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-sm hover:bg-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                            >
                                Read Live Data From MQTT
                            </button>
                        </div>
                        <div>
                            <button
                                type="submit"
                                onClick={onClickReadFile}
                                className="flex w-full justify-center rounded-md bg-red-500 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-sm hover:bg-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                            >
                                Read From File
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Home;
