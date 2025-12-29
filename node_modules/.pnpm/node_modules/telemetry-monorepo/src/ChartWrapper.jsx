import { useEffect, useRef, memo } from "react";
import PropTypes from "prop-types";
import * as echarts from "echarts";

const ChartWrapper = ({ options, group, height = "300px" }) => {
    const chartDiv = useRef(null);

    useEffect(() => {
        const chartInstance = echarts.init(chartDiv.current, "shine");
        // assign it to the given group
        if (group) {
            chartInstance.group = group;
        }
        chartInstance.setOption(options);

        // Optional cleanup for unmount
        return () => {
            chartInstance.dispose();
        };
    }, [options]);

    return <div ref={chartDiv} style={{ height: height }}></div>;
};

ChartWrapper.propTypes = {
    options: PropTypes.object.isRequired,
    group: PropTypes.string,
    style: PropTypes.object,
    height: PropTypes.string,
};

export default memo(ChartWrapper);
