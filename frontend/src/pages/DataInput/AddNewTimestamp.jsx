import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { getTrackById } from "../../api/tracks.routes";
import { createTimestamp } from "../../api/timestamps.routes";       // adjust if needed
import { getDrivers } from "../../api/drivers.routes";
import { getMonoposts } from "../../api/monoposts.routes";
import { getSessions } from "../../api/sessions.routs";

// NOTE: If this file lives at src/pages/DataInput/, the correct path to api is:
// import { createTimestamp } from "../../api/timestamps.routes";
// ...same for others. Adjust one ../ up or down based on your actual structure.

export default function AddNewTimestamp({ open, setOpen }) {
  const [drivers, setDrivers] = useState([]);
  const [setups, setSetups] = useState([]);
  const [sessions, setSessionWithTracks] = useState([]);

  useEffect(() => {
    console.log("AddNewTimestamp useEffect triggered. Open =", open);
    if (!open) return;

    getDrivers()
      .then((res) => {
        console.log("Drivers response:", res);
        setDrivers(res.data || []);
      })
      .catch((err) => console.error("Error fetching drivers:", err));

    getMonoposts()
      .then((res) => {
        console.log("Monoposts response:", res);
        setSetups(res.data || []);
      })
      .catch((err) => console.error("Error fetching monoposts:", err));

    getSessions()
      .then((res) => {
        const fetchTrackData = async () => {
          const result = await Promise.all(
            res.data.map(async (session) => {
              const trackRes = await getTrackById(session.trackId);
              return {
                ...session,
                trackData: trackRes.data,
              };
            })
          );
          console.log("fetched sessions with tracks:", result);
          setSessionWithTracks(result);
        };
        fetchTrackData();
      })
      .catch((err) => console.error("Error fetching sessions:", err));
  }, [open]);

  useEffect(() => {
    console.log("sessions updated:", sessions);
  }, [sessions]);

    const handleSubmit = (event) => {
        event.preventDefault();

        const obj = {
            startTime: event.target["start-time"].value,
            endTime: event.target["end-time"].value,
            driverId: event.target["driver-id"].value || null,
            setupId: event.target["setup-id"].value || null,
            sessionsId: event.target["session-id"].value || null, // user asked for sessionsId
        };

        console.log("Submitting timestamp:", obj);

        createTimestamp(obj)
            .then((response) => {
                console.log("Timestamp created successfully:", response.data);
                setOpen(false);
            })
            .catch((error) => {
                console.error("Error creating timestamp:", error);
            });
    };

    return (
        <Dialog open={open} onClose={setOpen} className="relative z-10">
            <div className="fixed inset-0" />
            <div className="fixed inset-0 overflow-hidden">
                <div className="absolute inset-0 overflow-hidden">
                    <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
                        <DialogPanel
                            transition
                            className="pointer-events-auto w-screen max-w-md transform transition duration-500 ease-in-out data-closed:translate-x-full sm:duration-700"
                        >
                            <form
                                onSubmit={handleSubmit}
                                className="flex h-full flex-col divide-y divide-gray-200 bg-white shadow-xl"
                            >
                                <div className="h-0 flex-1 overflow-y-auto">
                                    <div className="bg-green-600 px-4 py-6 sm:px-6">
                                        <div className="flex items-center justify-between">
                                            <DialogTitle className="text-base font-semibold text-white">
                                                New Timestamp
                                            </DialogTitle>
                                            <div className="ml-3 flex h-7 items-center">
                                                <button
                                                    type="button"
                                                    onClick={() => setOpen(false)}
                                                    className="relative rounded-md bg-green-600 text-green-200 hover:text-white focus:ring-2 focus:ring-white focus:outline-hidden"
                                                >
                                                    <span className="absolute -inset-2.5" />
                                                    <span className="sr-only">Close panel</span>
                                                    <XMarkIcon aria-hidden="true" className="size-6" />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="mt-1 text-sm text-green-300">
                                            Define start/end time and link to driver, setup, and session.
                                        </p>
                                    </div>

                                    <div className="divide-y divide-gray-200 px-4 sm:px-6">
                                        <div className="space-y-6 pt-6 pb-5">
                                            {/* Start Time */}
                                            <div>
                                                <label
                                                    htmlFor="start-time"
                                                    className="block text-sm font-medium text-gray-900"
                                                >
                                                    Start Time
                                                </label>
                                                <input
                                                    id="start-time"
                                                    name="start-time"
                                                    type="datetime-local"
                                                    required
                                                    className="mt-2 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-green-600 sm:text-sm/6"
                                                />
                                            </div>

                                            {/* End Time */}
                                            <div>
                                                <label
                                                    htmlFor="end-time"
                                                    className="block text-sm font-medium text-gray-900"
                                                >
                                                    End Time
                                                </label>
                                                <input
                                                    id="end-time"
                                                    name="end-time"
                                                    type="datetime-local"
                                                    required
                                                    className="mt-2 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-green-600 sm:text-sm/6"
                                                />
                                            </div>

                                            {/* Driver */}
                                            <div>
                                                <label
                                                    htmlFor="driver-id"
                                                    className="block text-sm font-medium text-gray-900"
                                                >
                                                    Driver
                                                </label>
                                                <select
                                                    id="driver-id"
                                                    name="driver-id"
                                                    className="mt-2 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm focus:border-green-600 focus:ring-green-600"
                                                >
                                                    <option value="">— Select Driver —</option>
                                                    {drivers.map((d) => (
                                                        <option key={d.id} value={d.id}>
                                                            {d.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Setup */}
                                            <div>
                                                <label
                                                    htmlFor="setup-id"
                                                    className="block text-sm font-medium text-gray-900"
                                                >
                                                    Setup
                                                </label>
                                                <select
                                                    id="setup-id"
                                                    name="setup-id"
                                                    className="mt-2 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm focus:border-green-600 focus:ring-green-600"
                                                >
                                                    <option value="">— Select Setup —</option>
                                                    {setups.map((s) => (
                                                        <option key={s.id} value={s.id}>
                                                            {s.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Session */}
                                            <div>
                                                <label
                                                    htmlFor="session-id"
                                                    className="block text-sm font-medium text-gray-900"
                                                >
                                                    Session
                                                </label>
                                                <select
                                                    id="session-id"
                                                    name="session-id"
                                                    className="mt-2 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm focus:border-green-600 focus:ring-green-600"
                                                >
                                                    <option value="">— Select Session —</option>
                                                    {sessions.map((sess) => (
                                                        <option key={sess.id} value={sess.id}>
                                                            {sess.csvFile}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer buttons */}
                                <div className="flex shrink-0 justify-end px-4 py-4">
                                    <button
                                        type="button"
                                        onClick={() => setOpen(false)}
                                        className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="ml-4 inline-flex justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-green-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
                                    >
                                        Save
                                    </button>
                                </div>
                            </form>
                        </DialogPanel>
                    </div>
                </div>
            </div>
        </Dialog>
    );
}

AddNewTimestamp.propTypes = {
    open: PropTypes.bool.isRequired,
    setOpen: PropTypes.func.isRequired,
};
