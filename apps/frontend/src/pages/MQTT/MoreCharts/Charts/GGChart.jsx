import ReactECharts from 'echarts-for-react'; 
import { useMemo } from 'react';

const GGChart = ({ data, height = 600 }) => {


// --- ALGORITHM: CALCULATE THE 95th PERCENTILE FRICTION ENVELOPE ---
    const envelopeData = useMemo(() => {
        if (!data || data.length === 0) return [];
        
        const numBins = 36; // Slice the circle into 36 pieces (10 degrees each)
        const bins = Array.from({ length: numBins }, () => []);

        // 1. Group every data point into its specific angle "slice"
        data.forEach(pt => {
            const x = pt[0]; // Lateral
            const y = pt[1]; // Longitudinal
            const radius = Math.sqrt(x * x + y * y);
            
            if (radius < 0.2) return; // Ignore the dead center

            let angle = Math.atan2(y, x) * (180 / Math.PI);
            if (angle < 0) angle += 360;

            const binIdx = Math.floor(angle / (360 / numBins)) % numBins;
            bins[binIdx].push({ x, y, radius });
        });

        // 2. Find the 95th Percentile push in each slice (Ignores vibration spikes!)
        const envelope = [];
        bins.forEach(bin => {
            if (bin.length > 5) { // Only calculate if we have enough data in this slice
                // Sort the bin from smallest radius to largest radius
                bin.sort((a, b) => a.radius - b.radius);
                
                // Grab the point that is exactly at the 95% mark
                const percentileIndex = Math.floor(bin.length * 0.95);
                const targetPt = bin[percentileIndex];
                
                envelope.push([targetPt.x, targetPt.y]);
            }
        });

        // 3. Connect the last point back to the first point to close the circle
        if (envelope.length > 0) {
            envelope.push(envelope[0]); 
        }
        
        return envelope;
    }, [data]);

    const options = {
        title: { text: 'G-G Diagram', left: 'center' },
        grid: { left: '10%', right: '10%', top: '15%', bottom: '15%' },
        tooltip: {
            formatter: (params) => {
                if (params.seriesName === 'Envelope') return 'Grip Limit';
                return `Lat: ${params.value[0].toFixed(2)} G<br/>Long: ${params.value[1].toFixed(2)} G`;
            }
        },
        xAxis: {
            type: 'value',
            name: 'Lateral G',
            nameLocation: 'middle',
            nameGap: 25,
            min: -3, max: 3, // Fixed scale for realistic G-G shape
            axisLabel: { formatter: '{value} G' },
            splitLine: { show: true }
        },
        yAxis: {
            type: 'value',
            name: 'Longitudinal G',
            nameLocation: 'middle',
            nameGap: 30,
            min: -2.5, max: 2.5, // Fixed scale
            axisLabel: { formatter: '{value} G' },
            splitLine: { show: true }
        },
        series: [
            // Series 1: The Cloud
            {
                name: 'Telemetry',
                symbolSize: 4,
                data: data,
                type: 'scatter',
                itemStyle: { 
                    color: '#8884d8', 
                    // PRO TIP: Lower opacity so the dense areas glow and noise fades!
                    opacity: 0.25 
                },
                zlevel: 1
            },
            // Series 2: The Envelope Limit Line
            {
                name: 'Envelope',
                data: envelopeData,
                type: 'line',
                smooth: true, // This beautifully curves the line between maximums
                symbol: 'none', // Hide the dots on the line
                lineStyle: {
                    color: '#ff0000', // Bold Red
                    width: 3,
                    type: 'dashed'
                },
                zlevel: 2 // Draw it ON TOP of the scatter plot
            }
        ]
    };

    // Kept your width/margin trick so the chart remains a perfect square!
    return <ReactECharts option={options} style={{ height: height, width: height, margin: "0 auto" }} />;
};

export default GGChart;