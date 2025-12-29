import { useEffect, useState } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";
import { CheckIcon } from "@heroicons/react/20/solid";
import PropTypes from "prop-types";
import { api } from "../../../services/api";

export default function RaceTrackSelect({ onChange }) {
    // 1. Initialize as an empty array
    const [raceTracks, setRaceTracks] = useState([]);
    const [selected, setSelected] = useState(null); 

    // 2. Handle selection change
    const onChangeRaceTrack = (raceTrack) => {
        setSelected(raceTrack);
        onChange(raceTrack);
    };

    // 3. Fetch data correctly (Handle the Promise)
    useEffect(() => {
        api.getTracks()
            .then((data) => {
                setRaceTracks(data || []); // Safety fallback
                
                // Select the first track automatically if available
                if (data && data.length > 0) {
                    const firstTrack = data[0];
                    setSelected(firstTrack);
                    onChange(firstTrack); // Notify parent immediately
                }
            })
            .catch((err) => console.error("Failed to load tracks:", err));
    }, []); // Run once on mount

    return (
        <Listbox value={selected} onChange={onChangeRaceTrack}>
            <div className="relative mt-2">
                <ListboxButton className="grid w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pr-2 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
                    <span className="col-start-1 row-start-1 truncate pr-6">
                        {selected ? selected.name : "Select a track..."}
                    </span>
                    <ChevronUpDownIcon
                        aria-hidden="true"
                        className="col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-500 sm:size-4"
                    />
                </ListboxButton>

                <ListboxOptions
                    transition
                    anchor="bottom start" // Ensures it floats on top
                    className="w-[var(--button-width)] z-50 mt-1 max-h-60 overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-hidden data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 sm:text-sm"
                >
                    {raceTracks.map((track) => (
                        <ListboxOption
                            key={track.id}
                            value={track}
                            className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-indigo-600 data-focus:text-white data-focus:outline-hidden"
                        >
                            <span className="block truncate font-normal group-data-selected:font-semibold">
                                {track.name}
                            </span>

                            <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-indigo-600 group-not-data-selected:hidden group-data-focus:text-white">
                                <CheckIcon aria-hidden="true" className="size-5" />
                            </span>
                        </ListboxOption>
                    ))}
                </ListboxOptions>
            </div>
        </Listbox>
    );
}

RaceTrackSelect.propTypes = {
    onChange: PropTypes.func.isRequired,
};