import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FolderIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import logo from "../assets/tuiasilogo.png";
import FileActionModal from "./FileActionModal";

function OfflineFiles() {
    const location = useLocation();
    // Safety check: Ensure sessions exist, default to empty array
    const sessions = location.state?.files || []; 
    
    const [sessionWithTracks, setSessionWithTracks] = useState([]);
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 14;
    
    // Modal State
    const [selectedSession, setSelectedSession] = useState(null);
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);

    // 1. Process Session Names (Extract Track Name)
    useEffect(() => {
        const processSessions = () => {
            if (!sessions) return;
            const processed = sessions.map(session => {
                if (!session.csvFileName) return session;
                
                // Try to extract track name from "TrackName_Timestamp.csv"
                const match = session.csvFileName.match(/^(.*)_(.*)$/);
                return {
                    ...session,
                    trackName: match ? match[1] : "Unknown Track"
                };
            });
            setSessionWithTracks(processed);
        };
        processSessions();
    }, [sessions]);

    // 2. Pagination Logic
    const totalPages = Math.ceil(sessionWithTracks.length / itemsPerPage);
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = sessionWithTracks.slice(indexOfFirstItem, indexOfLastItem);

    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    // 3. Click Handler - Opens Modal instead of navigating
    const onClickReadFile = (session) => {
        setSelectedSession(session);
        setIsActionModalOpen(true);
    };

    // Optional: Handler for when decoding finishes (e.g. to refresh UI)
    const handleSuccess = () => {
        console.log("File processing complete.");
    };

    return (
        <div className="flex h-screen items-center justify-center bg-gray-900 px-6 py-12">
            <div className="w-full max-w-xl bg-gray-800/75 rounded-lg p-6 shadow-lg">
                <img alt="Team Logo" src={logo} className="mx-auto h-10 w-auto" />
                
                <div className="mt-8">
                    <h2 className="text-sm font-medium text-gray-200">Session Files</h2>
                    
                    {/* List of Files */}
                    <ul role="list" className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-2">
                        {currentItems.map((session) => (
                            <li
                                key={session.id}
                                className="col-span-1 flex rounded-md shadow-sm hover:shadow-lg hover:bg-gray-200 transform hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                                onClick={() => onClickReadFile(session)}
                            >
                                <div className="bg-gray-100 flex w-16 shrink-0 items-center justify-center rounded-l-md text-sm font-medium text-gray-300">
                                    <FolderIcon aria-hidden="true" className="size-8" />
                                </div>
                                <div className="flex flex-1 items-center justify-between truncate rounded-r-md border-b border-r border-t border-gray-200 bg-white hover:bg-gray-100">
                                    <div className="flex-1 truncate px-4 py-2 text-sm">
                                        <p className="font-medium text-gray-900 hover:text-gray-600">
                                            Track: <strong>{session.trackName || session.csvFileName}</strong>
                                        </p>
                                        <p className="text-gray-400">
                                            Modified on <br />
                                            {session.date + ' ' + session.time}
                                        </p>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>

                    {/* Pagination Controls */}
                    {sessionWithTracks.length > itemsPerPage && (
                        <div className="flex items-center justify-between border-t border-gray-600 bg-gray-800 px-4 py-3 sm:px-6 mt-6 rounded-lg shadow-sm">
                            {/* Mobile Controls */}
                            <div className="flex flex-1 justify-between sm:hidden">
                                <button
                                    onClick={() => paginate(Math.max(1, currentPage - 1))}
                                    disabled={currentPage === 1}
                                    className="relative inline-flex items-center rounded-md border border-gray-500 bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 disabled:opacity-50"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => paginate(Math.min(totalPages, currentPage + 1))}
                                    disabled={currentPage === totalPages}
                                    className="relative ml-3 inline-flex items-center rounded-md border border-gray-500 bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 disabled:opacity-50"
                                >
                                    Next
                                </button>
                            </div>

                            {/* Desktop Controls */}
                            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                                <p className="text-sm text-gray-400">
                                    Page <span className="font-medium text-white">{currentPage}</span> of <span className="font-medium text-white">{totalPages}</span>
                                </p>
                                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                                    <button
                                        onClick={() => paginate(Math.max(1, currentPage - 1))}
                                        disabled={currentPage === 1}
                                        className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-600 hover:bg-gray-700 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                                    >
                                        <span className="sr-only">Previous</span>
                                        <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                                    </button>

                                    {/* Page Numbers */}
                                    {[...Array(totalPages)].map((_, i) => {
                                        const pageNum = i + 1;
                                        const isActive = currentPage === pageNum;
                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => paginate(pageNum)}
                                                aria-current={isActive ? "page" : undefined}
                                                className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                                                    isActive
                                                        ? "z-10 bg-indigo-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                                                        : "text-gray-300 ring-1 ring-inset ring-gray-600 hover:bg-gray-700 focus:z-20 focus:outline-offset-0"
                                                }`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}

                                    <button
                                        onClick={() => paginate(Math.min(totalPages, currentPage + 1))}
                                        disabled={currentPage === totalPages}
                                        className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-600 hover:bg-gray-700 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                                    >
                                        <span className="sr-only">Next</span>
                                        <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                </nav>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 4. Render the File Action Modal */}
            <FileActionModal 
                open={isActionModalOpen} 
                setOpen={setIsActionModalOpen} 
                session={selectedSession}
                onSuccess={handleSuccess}
            />
        </div>
    );
}

export default OfflineFiles;