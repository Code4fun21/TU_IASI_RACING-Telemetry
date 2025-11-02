import { useLocation, useNavigate } from "react-router-dom";
import * as echarts from "echarts";

import BrakePressureLineChart from "../components/LongerCharts/BrakePressureLineChart";
import MapChart from "../components/MapChart";
import BarChart from "../components/BarChart";
import { useEffect } from "react";

function LongerCharts() {
    const data = [
        ["2000-06-05", 116],
        ["2000-06-06", 129],
        ["2000-06-07", 135],
        ["2000-06-08", 86],
        ["2000-06-09", 73],
        ["2000-06-10", 85],
        ["2000-06-11", 73],
        ["2000-06-12", 68],
        ["2000-06-13", 92],
        ["2000-06-14", 130],
        ["2000-06-15", 245],
        ["2000-06-16", 139],
        ["2000-06-17", 115],
        ["2000-06-18", 111],
        ["2000-06-19", 309],
        ["2000-06-20", 206],
        ["2000-06-21", 137],
        ["2000-06-22", 128],
        ["2000-06-23", 85],
        ["2000-06-24", 94],
        ["2000-06-25", 71],
        ["2000-06-26", 106],
        ["2000-06-27", 84],
        ["2000-06-28", 93],
        ["2000-06-29", 85],
        ["2000-06-30", 73],
        ["2000-07-01", 83],
        ["2000-07-02", 125],
        ["2000-07-03", 107],
        ["2000-07-04", 82],
        ["2000-07-05", 44],
        ["2000-07-06", 72],
        ["2000-07-07", 106],
        ["2000-07-08", 107],
        ["2000-07-09", 66],
        ["2000-07-10", 91],
        ["2000-07-11", 92],
        ["2000-07-12", 113],
        ["2000-07-13", 107],
        ["2000-07-14", 131],
        ["2000-07-15", 111],
        ["2000-07-16", 64],
        ["2000-07-17", 69],
        ["2000-07-18", 88],
        ["2000-07-19", 77],
        ["2000-07-20", 83],
        ["2000-07-21", 111],
        ["2000-07-22", 57],
        ["2000-07-23", 55],
        ["2000-07-24", 60],
    ];
    const dateList = data.map(function (item) {
        return item[0];
    });
    const valueList = data.map(function (item) {
        return item[1];
    });
    const GROUP_ID = "syncGroup";

    useEffect(() => {
        // Connect all charts with the same group
        echarts.connect(GROUP_ID);
        // return () => echarts.disposeConnection("fleet");
    }, []);

    return (
        <>
            <div>
                <dl className="mt-5 flex flex-row  gap-5 ">
                    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500 text-center">Map</dt>

                        <MapChart data={sampleData} width={800} height={400} group={GROUP_ID} />
                    </div>
                </dl>
                <dl className="mt-5 flex flex-row  gap-5 "></dl>
                <dl className="mt-5 flex flex-row  gap-5 ">
                    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500 text-center">Brake Pressure</dt>
                        <BrakePressureLineChart
                            dateList={dateList}
                            valueList={valueList}
                            height={200}
                            width={700}
                            group={GROUP_ID}
                        />
                    </div>
                    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500 text-center">RPM</dt>
                        <BrakePressureLineChart
                            dateList={dateList}
                            valueList={valueList}
                            height={200}
                            width={700}
                            group={GROUP_ID}
                        />
                    </div>
                </dl>
                <dl className="mt-5 flex flex-row  gap-5 ">
                    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500 text-center">
                            Manifold Air Pressure
                        </dt>
                        <BrakePressureLineChart
                            dateList={dateList}
                            valueList={valueList}
                            height={200}
                            width={700}
                            group={GROUP_ID}
                        />
                    </div>
                    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500 text-center">
                            Manifold Air Temperature
                        </dt>
                        <BrakePressureLineChart
                            dateList={dateList}
                            valueList={valueList}
                            height={200}
                            width={700}
                            group={GROUP_ID}
                        />
                    </div>
                </dl>
                <dl className="mt-5 flex flex-row  gap-5 ">
                    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500 text-center">Coolant Temperature</dt>
                        <BrakePressureLineChart
                            dateList={dateList}
                            valueList={valueList}
                            height={200}
                            width={700}
                            group={GROUP_ID}
                        />
                    </div>
                    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500 text-center">TPS</dt>
                        <BrakePressureLineChart
                            dateList={dateList}
                            valueList={valueList}
                            height={200}
                            width={700}
                            group={GROUP_ID}
                        />
                    </div>
                </dl>
                <dl className="mt-5 flex flex-row  gap-5 ">
                    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500 text-center">Battery Voltage</dt>
                        <BrakePressureLineChart
                            dateList={dateList}
                            valueList={valueList}
                            height={200}
                            width={700}
                            group={GROUP_ID}
                        />
                    </div>
                    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500 text-center">
                            Air Density Correction
                        </dt>
                        <BrakePressureLineChart
                            dateList={dateList}
                            valueList={valueList}
                            height={200}
                            width={700}
                            group={GROUP_ID}
                        />
                    </div>
                </dl>
                <dl className="mt-5 flex flex-row  gap-5 ">
                    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500 text-center">RPM</dt>
                        <BrakePressureLineChart
                            dateList={dateList}
                            valueList={valueList}
                            height={200}
                            width={700}
                            group={GROUP_ID}
                        />
                    </div>
                    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500 text-center">Brake Pressure</dt>
                        <BarChart height={300} width={700} group={GROUP_ID} />
                    </div>
                </dl>
            </div>
        </>
    );
}

export default LongerCharts;
const sampleData = [
    [26.94207398, 46.52643458, 180],
    [26.94180435, 46.52640764, 170],
    [26.94153472, 46.52638069, 106],
    [26.94132361, 46.5262441, 43],
    [26.94134956, 46.52597715, 62],
    [26.94140095, 46.52571109, 55],
    [26.94145234, 46.52544503, 58],
    [26.94150373, 46.52517897, 75],
    [26.94168644, 46.52503626, 120],
    [26.94183116, 46.52520274, 71],
    [26.94177809, 46.52546827, 69],
    [26.94172267, 46.52573352, 96],
    [26.94167664, 46.52599957, 55],
    [26.94185747, 46.5261368, 77],
    [26.94208074, 46.52606507, 65],
    [26.94197211, 46.52582961, 56],
    [26.94206511, 46.52558574, 117],
    [26.94229455, 46.52544947, 43],
    [26.94254363, 46.52535126, 82],
    [26.94269306, 46.52512672, 111],
    [26.94260251, 46.52497052, 53],
    [26.94237496, 46.525104, 102],
    [26.9421197, 46.5250598, 97],
    [26.94196775, 46.52486141, 90],
    [26.9416997, 46.52482855, 64],
    [26.94143252, 46.52479332, 73],
    [26.94128917, 46.52459868, 96],
    [26.94130862, 46.52432841, 42],
    [26.94132806, 46.52405815, 93],
    [26.94144042, 46.52386588, 79],
    [26.94165676, 46.52393611, 50],
    [26.94179158, 46.5239891, 65],
    [26.94186998, 46.52387751, 64],
    [26.94191286, 46.52374839, 107],
    [26.9420118, 46.52366189, 99],
    [26.94216064, 46.52370255, 92],
    [26.94214793, 46.52394913, 77],
    [26.94209251, 46.52417766, 91],
    [26.94184013, 46.52428137, 106],
    [26.94168799, 46.52443823, 88],
    [26.94177362, 46.52457135, 107],
    [26.94214979, 46.52464247, 82],
    [26.94258626, 46.52470866, 93],
    [26.94291695, 46.52477053, 81],
    [26.94309684, 46.52494657, 104],
    [26.94295158, 46.52524165, 104],
    [26.94270977, 46.52562038, 107],
    [26.94243157, 46.52607885, 67],
    [26.94219955, 46.5262962, 96],
    [26.94207065, 46.52640425, 111],
    [26.94206356, 46.52643461, 73],
];
