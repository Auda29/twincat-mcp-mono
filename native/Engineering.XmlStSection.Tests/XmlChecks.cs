using System;
using TwinCatMcp.Engineering.Host;

static class Checks
{
    static readonly Guid Pou = Guid.Parse("11111111-1111-1111-1111-111111111111");
    static readonly Guid Method = Guid.Parse("22222222-2222-2222-2222-222222222222");
    static readonly Guid Action = Guid.Parse("33333333-3333-3333-3333-333333333333");
    static readonly string Xml = "<?xml version=\"1.0\"?>\r\n<TcPlcObject Version=\"1.1.0.1\">\r\n" +
        "<POU Name=\"FB_A\" Id=\"{11111111-1111-1111-1111-111111111111}\">" +
        "<Declaration><![CDATA[FUNCTION_BLOCK FB_A\r\nVAR\r\nEND_VAR]]></Declaration>" +
        "<Implementation><ST><![CDATA[one\r\ntwo]]></ST></Implementation>" +
        "<Method Name=\"Run\" Id=\"{22222222-2222-2222-2222-222222222222}\">" +
        "<Declaration><![CDATA[METHOD Run]]></Declaration><Implementation><ST><![CDATA[do();]]></ST></Implementation></Method>" +
        "<Action Name=\"Act\" Id=\"{33333333-3333-3333-3333-333333333333}\"><Implementation><ST><![CDATA[]]></ST></Implementation></Action>" +
        "</POU></TcPlcObject>";
    static void Require(bool value) { if (!value) throw new Exception("XML mapping check failed"); }
    static XmlStSection Map(string xml, Guid id, string name, string section) { return XmlStSectionMap.TryMap(xml, id, name, section); }
    static void Main()
    {
        var m = Map(Xml, Pou, "FB_A", "implementation");
        Require(m != null && m.Text == "one\r\ntwo" && Xml.Substring(m.Start, m.Length) == m.Text);
        var targets = XmlStSectionMap.TryTargets(Xml, @"C:\fixture\FB_A.TcPOU");
        Require(targets != null && targets.Count == 3 && targets[0].Kind == "pou" && targets[1].Kind == "method" && targets[2].Kind == "action");
        Require(targets[1].ObjectId == @"C:\fixture\FB_A.TcPOU|22222222-2222-2222-2222-222222222222|FB_A.Run" && targets[1].Sections.Length == 2);
        Require(targets[2].Sections.Length == 1 && targets[2].Sections[0] == "implementation");
        Require(XmlStSectionMap.TryTargets(Xml, new string('x', 1024)) == null);
        Require(XmlStSectionMap.TryTargets(Xml.Replace("<ST><![CDATA[one\r\ntwo]]></ST>", "<FBD><![CDATA[x]]></FBD>"), "test") == null);
        var many = new System.Text.StringBuilder();
        for (int i = 0; i < 64; i++) many.Append("<Action Name=\"A" + i + "\" Id=\"" + Guid.NewGuid().ToString("D") + "\"><Implementation><ST><![CDATA[x]]></ST></Implementation></Action>");
        Require(XmlStSectionMap.TryTargets(Xml.Replace("</POU>", many + "</POU>"), "test") == null);
        Require(Map(Xml, Method, "FB_A.Run", "declaration").Text == "METHOD Run");
        Require(Map(Xml, Action, "FB_A.Act", "implementation").Text == "");
        Require(Map(Xml, Method, "FB_A", "declaration") == null);
        Require(Map(Xml, Method, "FB_A.run", "declaration") == null);
        string changed;
        Require(XmlStSectionMap.TryReplace(Xml, Pou, "FB_A", "implementation", "one\r\ntwo", "x\r\ny", out changed));
        Require(changed == Xml.Substring(0, m.Start) + "x\r\ny" + Xml.Substring(m.Start + m.Length));
        Require(Map(changed, Pou, "FB_A", "implementation").Text == "x\r\ny");
        Require(!XmlStSectionMap.TryReplace(Xml, Pou, "FB_A", "implementation", "one\ntwo", "bad", out changed) && changed == null);
        Require(!XmlStSectionMap.TryReplace(Xml, Pou, "FB_A", "implementation", m.Text, "]]>", out changed));
        Require(!XmlStSectionMap.TryReplace(Xml, Pou, "FB_A", "implementation", m.Text, "\u0001", out changed));
        Require(Map(Xml.Replace("33333333-3333-3333-3333-333333333333", "22222222-2222-2222-2222-222222222222"), Pou, "FB_A", "implementation") == null);
        Require(Map(Xml.Replace("<TcPlcObject ", "<TcPlcObject xmlns=\"urn:test\" "), Pou, "FB_A", "implementation") == null);
        Require(Map(Xml.Replace("<Method Name", "<Property Name").Replace("</Method>", "</Property>"), Pou, "FB_A", "implementation") == null);
        Require(Map(Xml.Replace("<ST><![CDATA[one\r\ntwo]]></ST>", "<FBD><![CDATA[one\r\ntwo]]></FBD>"), Pou, "FB_A", "implementation") == null);
        Require(Map(Xml.Replace("<![CDATA[one\r\ntwo]]>", "<![CDATA[one]]><![CDATA[two]]>"), Pou, "FB_A", "implementation") == null);
        Require(Map(Xml.Replace("<![CDATA[one\r\ntwo]]>", "one"), Pou, "FB_A", "implementation") == null);
        Require(Map("<!DOCTYPE TcPlcObject [<!ENTITY x 'evil'>]>" + Xml, Pou, "FB_A", "implementation") == null);
        Require(Map(Xml.Replace("<POU ", "<POU Other=\"<![CDATA[fake]]>\" "), Pou, "FB_A", "implementation") == null);
        Require(Map(Xml.Replace("<POU ", "<!-- <![CDATA[fake]]> --> <POU "), Pou, "FB_A", "implementation").Text == m.Text);
        Console.WriteLine("XML ST section checks passed");
    }
}
