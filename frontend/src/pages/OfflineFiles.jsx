import { addFile, createCsv, createTable, getFileData, getFiles, getTable, } from "../api/endpoints";
import{getTrackById} from "../api/tracks.routes";
import backgroundImage from "../assets/cool-background.png";
import logo from "../assets/tuiasilogo.png";
import { useLocation, useNavigate } from "react-router-dom";
import { FolderIcon } from "@heroicons/react/20/solid";
import { useEffect, useState } from "react";

function OfflineFiles() {
    const sessions = useLocation().state.files;
    const [sessionWithTracks, setSessionWithTracks] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchTrackData = async () => {
            const result = await Promise.all(
                sessions.map(async (session) => {
                    const res = await getTrackById(session.trackId);
                    return {
                        ...session,
                        trackData: res.data,
                    };
                })
            );
            setSessionWithTracks(result);
        };

        fetchTrackData();
    }, [sessions]);



  useEffect(() => {
    console.log("sessions updated:", sessionWithTracks);
  }, [sessionWithTracks]);

  
    const onClickReadFile = async (session) => {
        const trackData = session.trackData; // already fetched in useEffect
        console.log("track data", session.csvFile, trackData);
        await getFileData(session.csvFile, trackData.gates,trackData.trackCoordonates);

        // const create_respons= await  createTable ();
        
        const fileData = await createTable ().then((response) => {
            // console.log("Create table", response.data.tables);
            return response?.data.tables;
        });
        
        navigate("/from-file", { state: { fileData,session } });
    };

    return (
        <>
            <div
                className="flex h-screen items-center justify-center bg-cover bg-center bg-no-repeat px-6 py-12"
                style={{ backgroundImage: `url(${backgroundImage})` }}
            >
                <div className="w-full max-w-xl bg-gray-800/75 rounded-lg p-6 shadow-lg">
                    <img alt="Your Company" src={logo} className="mx-auto h-10 w-auto" />
                    <h2 className="mt-10 text-center text-2xl/9 font-bold tracking-tight text-white"></h2>

                    <div>
                        <h2 className="text-sm font-medium text-gray-200">Files</h2>
                        <ul role="list" className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-2">
                            {sessionWithTracks.map((session) => (
                                    
                                <li
                                    key={session.id}
                                    className="col-span-1 flex rounded-md shadow-sm  hover:shadow-lg hover:bg-gray-200 transform hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                                    onClick={()=>

                                         onClickReadFile(session)
                                    }
                                >
                                    <div className="bg-gray-100 flex w-16 shrink-0 items-center justify-center rounded-l-md text-sm font-medium text-gray-300">
                                        <FolderIcon aria-hidden="true" className="size-8" />
                                    </div>
                                    <div className="flex flex-1 items-center justify-between truncate rounded-r-md border-b border-r border-t border-gray-200 bg-white hover:bg-gray-100">
                                        <div className="flex-1 truncate px-4 py-2 text-sm">
                                            <a
                                                // href={session.href}
                                                className="font-medium text-gray-900 hover:text-gray-600"
                                            >
                                            Track name: <strong>{session.trackData.name}</strong>
                                            </a>
                                            <p className="text-gray-400">
                                                Modified on
                                                <br />
                                                {session.date+' '+session.time}
                                            </p>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                    {/* <div>
                            <button
                                type="submit"
                                onClick={onClickReadFile}
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
                        </div> */}
                </div>
            </div>
        </>
    );
}

export default OfflineFiles;

