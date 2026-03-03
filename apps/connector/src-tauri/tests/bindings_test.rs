use connector::bindings::BindingMap;

#[test]
fn stores_binding_by_agent_id() {
    let mut b = BindingMap::default();
    b.set("main", "mac-node-1");
    assert_eq!(b.get("main"), Some("mac-node-1".to_string()));
}
